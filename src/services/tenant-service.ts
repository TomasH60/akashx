import { createHash, createPrivateKey, randomUUID, X509Certificate } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  certificateManager,
  createChainNodeSDK,
  createStargateClient,
  msg,
  transaction,
  type TxMessage,
} from '@akashnetwork/chain-sdk';
import { TxRaw } from '@akashnetwork/chain-sdk/private-types/cosmos.v1beta1';
import { fromBech32 } from '@cosmjs/encoding';
import { getWalletPassword, getWalletPath } from '../lib/wallet-flags.js';
import { dataDirectory, json, writePrivateJson, type TenantConfig } from './config-service.js';
import { WalletService } from './wallet-service.js';
import { loadSDL } from './sdl-service.js';

export function address(value: string): string {
  const decoded = fromBech32(value, 90);
  if (decoded.prefix !== 'akash' || decoded.data.length !== 20)
    throw new Error('Expected an Akash account address.');
  return value;
}
export function sequence(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > 18446744073709551615n)
    throw new Error('Deployment sequence must be a positive uint64 integer.');
  return BigInt(value);
}
export function coin(value: string) {
  const match = /^([1-9]\d*)(uakt|uact)$/.exec(value);
  if (!match) throw new Error('Use a positive integer coin amount, e.g. 500000uact.');
  return { amount: match[1]!, denom: match[2]! };
}
export interface LeaseSelection {
  provider?: string | undefined;
  gseq?: number | undefined;
  oseq?: number | undefined;
}
export interface ClientCertificate {
  cert: string;
  publicKey: string;
  privateKey: string;
}

export class TenantService {
  readonly sdk;
  constructor(
    readonly config: TenantConfig,
    readonly log: (line: string) => void = () => {},
  ) {
    this.sdk = createChainNodeSDK({
      query: { baseUrl: config.grpc, transportOptions: { defaultTimeoutMs: 15_000 } },
    });
  }
  async dispose() {
    await this.sdk[Symbol.asyncDispose]();
  }
  async owner(explicit?: string) {
    if (explicit) return address(explicit);
    const wallet: unknown = JSON.parse(
      await readFile(getWalletPath(this.config.walletFile), 'utf8'),
    );
    if (
      !wallet ||
      typeof wallet !== 'object' ||
      !('address' in wallet) ||
      typeof wallet.address !== 'string'
    )
      throw new Error('Invalid wallet file.');
    return address(wallet.address);
  }
  async verifyNetwork() {
    const response = await fetch(new URL('/status', this.config.rpc), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`RPC status returned HTTP ${response.status}.`);
    const status = (await response.json()) as {
      result?: { node_info?: { network?: string }; sync_info?: { catching_up?: boolean } };
    };
    const rpcChain = status.result?.node_info?.network;
    const latest = await this.sdk.cosmos.base.tendermint.v1beta1.getLatestBlock({});
    const grpcChain = latest.block?.header?.chainId ?? latest.sdkBlock?.header?.chainId;
    if (rpcChain !== this.config.network || grpcChain !== this.config.network)
      throw new Error(
        `Network mismatch: expected ${this.config.network}, RPC=${rpcChain}, gRPC=${grpcChain}.`,
      );
    if (status.result?.sync_info?.catching_up) throw new Error('RPC node is still synchronizing.');
    return {
      network: rpcChain,
      height: latest.block?.header?.height ?? latest.sdkBlock?.header?.height,
    };
  }
  async balances(owner: string) {
    return {
      balances: await allPages(async (key) => {
        const result = await this.sdk.cosmos.bank.v1beta1.getAllBalances({
          address: owner,
          pagination: { key, limit: 100 },
        });
        return { items: result.balances, next: result.pagination?.nextKey };
      }),
    };
  }
  async certificates(owner: string) {
    return {
      certificates: await allPages(async (key) => {
        const result = await this.sdk.akash.cert.v1.getCertificates({
          filter: { owner },
          pagination: { key, limit: 100 },
        });
        return { items: result.certificates, next: result.pagination?.nextKey };
      }),
    };
  }
  certificatePath(owner: string) {
    return join(dataDirectory(), 'certificates', this.config.network, `${address(owner)}.json`);
  }
  async certificate(owner: string): Promise<ClientCertificate> {
    const value = JSON.parse(
      await readFile(this.certificatePath(owner), 'utf8'),
    ) as ClientCertificate;
    if (!value.cert || !value.privateKey || !value.publicKey)
      throw new Error('Invalid local client certificate.');
    const parsed = new X509Certificate(value.cert);
    if (
      parsed.subject
        .split('\n')
        .filter((part) => part.startsWith('CN='))
        .join('') !== `CN=${owner}` ||
      !parsed.checkPrivateKey(createPrivateKey(value.privateKey))
    )
      throw new Error('Client certificate does not match the selected wallet or private key.');
    const info = await certificateManager.parsePem(value.cert);
    if (info.issuedOn > new Date()) throw new Error('Client certificate is not valid yet.');
    if (info.expiresOn <= new Date()) throw new Error('Client certificate has expired.');
    return value;
  }
  async createCertificate() {
    const owner = await this.owner();
    const path = this.certificatePath(owner);
    let cert: ClientCertificate;
    try {
      cert = await this.certificate(owner);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      cert = await certificateManager.generatePEM(owner);
      await mkdir(join(dataDirectory(), 'certificates', this.config.network), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(path, json(cert), { flag: 'wx', mode: 0o600 });
    }
    const existing = await this.certificates(owner);
    if (
      existing.certificates.some(
        (item) =>
          item.certificate?.state === 1 &&
          Buffer.from(item.certificate.cert).equals(Buffer.from(cert.cert)),
      )
    )
      return { status: 'already published', path };
    return this.submit('cert-create', owner, [
      msg(this.sdk.akash.cert.v1.createCertificate, {
        owner,
        cert: Buffer.from(cert.cert),
        pubkey: Buffer.from(cert.publicKey),
      }),
    ]);
  }
  async submit(label: string, owner: string, messages: TxMessage[]) {
    await this.verifyNetwork();
    await this.checkPending(label, owner);
    const wallet = await new WalletService().load(
      getWalletPath(this.config.walletFile),
      getWalletPassword(),
    );
    if (wallet.address !== owner) throw new Error('Signing wallet does not own this operation.');
    const client = createStargateClient({
      baseUrl: this.config.rpc,
      signer: wallet.signer,
      defaultGasPrice: this.config.gasPrice,
    });
    const journal = join(dataDirectory(), 'transactions', `${randomUUID()}.json`);
    const entry = {
      operation: label,
      network: this.config.network,
      owner,
      createdAt: new Date().toISOString(),
    };
    await writePrivateJson(journal, { ...entry, status: 'submitting' });
    this.log(`Submitting ${label} on ${this.config.network}. Recovery record: ${journal}`);
    let broadcastStarted = false;
    const sdk = createChainNodeSDK({
      query: { baseUrl: this.config.grpc },
      tx: {
        signer: {
          signAndBroadcast: async (messages) => {
            const fee = await client.estimateFee(messages);
            this.log(`Estimated fee: ${json(fee)}`);
            const signed = await client.sign(messages, fee, '');
            const hash = createHash('sha256')
              .update(TxRaw.encode(signed).finish())
              .digest('hex')
              .toUpperCase();
            await writePrivateJson(journal, { ...entry, status: 'signed', transactionHash: hash });
            this.log(`Broadcasting: ${hash}`);
            broadcastStarted = true;
            return client.broadcast(signed);
          },
        },
      },
    });
    try {
      const result = await transaction(sdk as Parameters<typeof transaction>[0], messages);
      await writePrivateJson(journal, {
        ...entry,
        status: result.code === 0 ? 'confirmed' : 'failed',
        transactionHash: result.transactionHash,
        code: result.code,
      });
      this.log(`Transaction: ${result.transactionHash}`);
      if (result.code !== 0)
        throw new Error(`Transaction failed with code ${result.code}: ${result.rawLog}`);
      return { transactionHash: result.transactionHash, code: result.code };
    } catch (error) {
      if (!broadcastStarted)
        await writePrivateJson(journal, { ...entry, status: 'failed-before-broadcast' });
      this.log(
        `If submission was interrupted, inspect chain state before retrying. Record: ${journal}`,
      );
      throw error;
    } finally {
      await sdk[Symbol.asyncDispose]();
      await client.disconnect();
    }
  }
  async checkPending(operation: string, owner: string) {
    const directory = join(dataDirectory(), 'transactions');
    let files: string[];
    try {
      files = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const file of files.filter((item) => item.endsWith('.json'))) {
      const path = join(directory, file);
      const record = JSON.parse(await readFile(path, 'utf8')) as {
        operation: string;
        owner: string;
        network: string;
        status: string;
        transactionHash?: string;
      };
      if (
        record.operation !== operation ||
        record.owner !== owner ||
        record.network !== this.config.network ||
        !['submitting', 'signed'].includes(record.status)
      )
        continue;
      if (record.transactionHash) {
        let response;
        try {
          response = await this.sdk.cosmos.tx.v1beta1.getTx({ hash: record.transactionHash });
        } catch (error) {
          throw new Error(
            `Previous transaction ${record.transactionHash} has unresolved inclusion. Inspect ${path} before retrying.`,
            { cause: error },
          );
        }
        if (!response.txResponse)
          throw new Error(`Previous transaction is unresolved: ${record.transactionHash}`);
        await writePrivateJson(path, {
          ...record,
          status: response.txResponse.code === 0 ? 'confirmed' : 'failed',
          code: response.txResponse.code,
        });
        if (response.txResponse.code === 0)
          throw new Error(
            `Previous transaction ${record.transactionHash} succeeded. Inspect state before explicitly starting another operation.`,
          );
      } else {
        // Without a saved hash this process never reached broadcast.
        await writePrivateJson(path, { ...record, status: 'failed-before-broadcast' });
      }
    }
  }
  async mint(amount: string) {
    const value = coin(amount);
    if (value.denom !== 'uakt') throw new Error('mint-act accepts uakt to burn.');
    const owner = await this.owner();
    await this.sdk.akash.bme.v1.getParams({});
    const balances = await this.balances(owner);
    if (
      BigInt(balances.balances.find((item) => item.denom === 'uakt')?.amount ?? '0') <=
      BigInt(value.amount)
    )
      throw new Error('Insufficient AKT; retain AKT for transaction fees.');
    return this.submit(`mint-act-${amount}`, owner, [
      msg(this.sdk.akash.bme.v1.mintACT, { owner, to: owner, coinsToBurn: value }),
    ]);
  }
  async deployment(owner: string, dseq: string) {
    return this.sdk.akash.deployment.v1beta4.getDeployment({ id: { owner, dseq: sequence(dseq) } });
  }
  selection(value: LeaseSelection) {
    return {
      ...(value.provider ? { provider: address(value.provider) } : {}),
      ...(value.gseq !== undefined ? { gseq: value.gseq } : {}),
      ...(value.oseq !== undefined ? { oseq: value.oseq } : {}),
    };
  }
  async bids(owner: string, dseq: string, selection: LeaseSelection = {}) {
    return {
      bids: await allPages(async (key) => {
        const result = await this.sdk.akash.market.v1beta5.getBids({
          filters: { owner, dseq: sequence(dseq), state: 'open', ...this.selection(selection) },
          pagination: { key, limit: 100 },
        });
        return { items: result.bids, next: result.pagination?.nextKey };
      }),
    };
  }
  async leases(owner: string, dseq: string, selection: LeaseSelection = {}) {
    return {
      leases: await allPages(async (key) => {
        const result = await this.sdk.akash.market.v1beta5.getLeases({
          filters: { owner, dseq: sequence(dseq), state: 'active', ...this.selection(selection) },
          pagination: { key, limit: 100 },
        });
        return { items: result.leases, next: result.pagination?.nextKey };
      }),
    };
  }
  async selectedLease(owner: string, dseq: string, selection: LeaseSelection) {
    const result = await this.leases(owner, dseq, selection);
    if (result.leases.length !== 1 || !result.leases[0]?.lease?.id)
      throw new Error(
        'Expected one active lease. Specify --provider, --gseq and --oseq to disambiguate.',
      );
    return result.leases[0].lease.id;
  }
  async createDeployment(file: string, dseq: string, deposit: string) {
    await this.verifyNetwork();
    const owner = await this.owner();
    await new WalletService().load(getWalletPath(this.config.walletFile), getWalletPassword());
    const id = { owner, dseq: sequence(dseq) };
    const sdl = await loadSDL(file);
    const amount = coin(deposit);
    const params = await this.sdk.akash.deployment.v1beta4.getParams({});
    const minimum = params.params?.minDeposits.find((item) => item.denom === amount.denom);
    if (!minimum || BigInt(amount.amount) < BigInt(minimum.amount))
      throw new Error(
        `Deposit does not meet live chain requirements: ${json(params.params?.minDeposits)}`,
      );
    if (
      sdl.groupSpecs.some((group) =>
        group.resources.some((resource) => resource.price?.denom !== amount.denom),
      )
    )
      throw new Error('SDL pricing denomination must match the deposit denomination.');
    const balances = await this.balances(owner);
    if (
      BigInt(balances.balances.find((item) => item.denom === amount.denom)?.amount ?? '0') <
      BigInt(amount.amount)
    )
      throw new Error(`Insufficient ${amount.denom} for deposit.`);
    const path = this.deploymentPath(owner, dseq);
    await mkdir(join(dataDirectory(), 'deployments'), { recursive: true, mode: 0o700 });
    try {
      await writeFile(
        path,
        json({
          network: this.config.network,
          owner,
          dseq,
          hash: Buffer.from(sdl.hash).toString('hex'),
          file,
          status: 'submitting',
        }),
        { flag: 'wx', mode: 0o600 },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error(
          `Deployment ${dseq} already has a local creation record. Inspect deployment status or use deployment deploy --resume; do not create it again.`,
          { cause: error },
        );
      throw error;
    }
    const result = await this.submit(`deployment-create-${dseq}`, owner, [
      msg(this.sdk.akash.deployment.v1beta4.createDeployment, {
        id,
        groups: sdl.groupSpecs,
        hash: sdl.hash,
        deposit: { amount, sources: [1] },
        reclamation: sdl.reclamation,
      }),
    ]);
    await writePrivateJson(path, {
      network: this.config.network,
      owner,
      dseq,
      hash: Buffer.from(sdl.hash).toString('hex'),
      file,
      status: 'created',
      ...result,
    });
    return { owner, dseq, ...result };
  }
  deploymentPath(owner: string, dseq: string) {
    const key = createHash('sha256')
      .update(`${this.config.network}/${address(owner)}/${sequence(dseq)}`)
      .digest('hex');
    return join(dataDirectory(), 'deployments', `${key}.json`);
  }
  async createLease(dseq: string, selection: LeaseSelection & { bseq?: number | undefined }) {
    const owner = await this.owner();
    const result = await this.bids(owner, dseq, selection);
    const matches = result.bids.filter(
      (item) => selection.bseq === undefined || item.bid?.id?.bseq === selection.bseq,
    );
    if (matches.length !== 1 || !matches[0]?.bid?.id)
      throw new Error(
        'Expected one open bid. Inspect deployment bids and select --provider, --gseq, --oseq and --bseq.',
      );
    const bid = matches[0].bid;
    this.log(`Selected bid: ${json(bid)}`);
    return this.submit(`lease-create-${dseq}`, owner, [
      msg(this.sdk.akash.market.v1beta5.createLease, { bidId: bid.id! }),
    ]);
  }
  async close(dseq: string) {
    const owner = await this.owner();
    const current = await this.deployment(owner, dseq);
    if (current.deployment?.state === 2) return { status: 'already closed' };
    return this.submit(`deployment-close-${dseq}`, owner, [
      msg(this.sdk.akash.deployment.v1beta4.closeDeployment, {
        id: { owner, dseq: sequence(dseq) },
      }),
    ]);
  }
}

// Never silently select a bid or certificate from an incomplete first page.
export async function allPages<T>(
  query: (key: Uint8Array) => Promise<{ items: T[]; next?: Uint8Array | undefined }>,
): Promise<T[]> {
  const items: T[] = [];
  let key: Uint8Array = new Uint8Array();
  const seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const result = await query(key);
    items.push(...result.items);
    if (!result.next?.length) return items;
    key = result.next;
    const token = Buffer.from(key).toString('hex');
    if (seen.has(token)) throw new Error('Chain returned a repeated pagination key.');
    seen.add(token);
  }
  throw new Error('Query exceeded 100 pages; narrow the selection.');
}
