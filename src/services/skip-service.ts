import {
  assets,
  chains,
  executeRoute,
  route,
  setClientOptions,
  transactionStatus,
  type ExecuteRouteOptions,
  type RouteRequest,
} from '@skip-go/client';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { BridgeEnvironment } from '../lib/bridge-flags.js';

type SkipAssetMap = NonNullable<Awaited<ReturnType<typeof assets>>>;
type SkipAsset = SkipAssetMap[string][number];
type SkipChain = NonNullable<Awaited<ReturnType<typeof chains>>>[number];
type SkipRoute = NonNullable<Awaited<ReturnType<typeof route>>>;
type SkipStatusResponse = Awaited<ReturnType<typeof transactionStatus>>;

export interface BridgeRequest {
  readonly allowSwap?: boolean;
  readonly amount: string;
  readonly fromChain: string;
  readonly fromToken: string;
  readonly slippage: number;
  readonly toAddress: string;
  readonly toChain: string;
  readonly toToken: string;
}

export interface BridgeQuote {
  readonly actions: string[];
  readonly destinationChainId: string;
  readonly estimatedDurationSeconds: number;
  readonly fees: string[];
  readonly fromAmount: string;
  readonly fromSymbol: string;
  readonly minimumReceived: string;
  readonly priceImpact: string;
  readonly requiredChainAddresses: string[];
  readonly sourceChainId: string;
  readonly toAmount: string;
  readonly toSymbol: string;
  readonly transactionsRequired: number;
  readonly warning?: string;
}

export interface BridgeSubmission extends BridgeQuote {
  readonly transactionHashes: ReadonlyArray<{ chainId: string; hash: string }>;
}

export interface BridgeStatus {
  readonly explorerLinks: string[];
  readonly status: string;
}

export interface CosmosSigner {
  getAccounts(): Promise<readonly { address: string }[]>;
}

export interface SkipApi {
  configure(apiKey?: string): void;
  execute(options: ExecuteRouteOptions): Promise<void>;
  getAssets(options: Parameters<typeof assets>[0]): ReturnType<typeof assets>;
  getChains(options: Parameters<typeof chains>[0]): ReturnType<typeof chains>;
  getRoute(request: RouteRequest): Promise<SkipRoute>;
  getStatus(request: { chainId: string; txHash: string }): Promise<SkipStatusResponse>;
}

export interface EvmSignerContext {
  readonly address: string;
  readonly chainId: string;
  readonly signer: WalletClient;
}

export type EvmSignerFactory = (rpcUrl: string, privateKey: string) => Promise<EvmSignerContext>;
export type CosmosSignerFactory = (prefix: string) => Promise<CosmosSigner>;
export type BridgeQuoteHandler = (quote: BridgeQuote) => Promise<void> | void;
export type BridgeProgressHandler = (message: string) => Promise<void> | void;

export class SkipServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SkipServiceError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createEvmSigner(rpcUrl: string, privateKey: string): Promise<EvmSignerContext> {
  const account = privateKeyToAccount(normalizeEvmPrivateKey(privateKey));
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ transport });
  const chainId = await publicClient.getChainId();
  const chain = defineChain({
    id: chainId,
    name: `EVM ${chainId}`,
    nativeCurrency: { decimals: 18, name: 'Native token', symbol: 'ETH' },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const signer = createWalletClient({ account, chain, transport });
  return { address: account.address, chainId: chainId.toString(), signer };
}

export function normalizeEvmPrivateKey(privateKey: string): Hex {
  const trimmed = privateKey.trim();
  const normalized = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x[\da-fA-F]{64}$/.test(normalized)) {
    throw new SkipServiceError(
      'AKASHX_EVM_PRIVATE_KEY must contain exactly 64 hexadecimal characters, optionally prefixed with 0x.',
    );
  }
  return normalized as Hex;
}

export function createSkipApi(): SkipApi {
  return {
    configure(key) {
      setClientOptions(key ? { apiKey: key } : {});
    },
    execute(options) {
      return executeRoute(options);
    },
    getAssets(options) {
      return assets(options);
    },
    getChains(options) {
      return chains(options);
    },
    async getRoute(request) {
      const result = await route(request);
      if (!result) throw new Error('Skip Go returned no route.');
      return result;
    },
    async getStatus(request) {
      return transactionStatus(request);
    },
  } satisfies SkipApi;
}

export class SkipService {
  private assetMap: SkipAssetMap = {};
  private chainList: SkipChain[] = [];
  private initialized = false;

  constructor(
    private readonly api: SkipApi = createSkipApi(),
    private readonly environment: BridgeEnvironment = 'testnet',
    private readonly signerFactory: EvmSignerFactory = createEvmSigner,
  ) {
    this.api.configure(process.env.AKASHX_SKIP_API_KEY);
  }

  async getBridgeQuote(request: BridgeRequest): Promise<BridgeQuote> {
    const resolved = await this.resolveRoute(request);
    return this.quoteResult(resolved.route, resolved.fromToken, resolved.toToken, request.slippage);
  }

  async getBridgeStatus(transactionId: string, chainId: string): Promise<BridgeStatus> {
    let response: SkipStatusResponse;
    try {
      response = await this.api.getStatus({ chainId, txHash: transactionId });
    } catch (error) {
      throw new SkipServiceError(
        `Could not get the Skip Go transaction status: ${errorMessage(error)}`,
        { cause: error },
      );
    }

    return {
      explorerLinks: collectExplorerLinks(response),
      status:
        [...new Set(response.transfers?.flatMap((transfer) => transfer.state ?? []) ?? [])].join(
          ', ',
        ) || 'unknown',
    };
  }

  async submitBridge(
    request: BridgeRequest,
    rpcUrl: string,
    privateKey: string,
    cosmosSignerFactory: CosmosSignerFactory,
    onQuote?: BridgeQuoteHandler,
    onProgress?: BridgeProgressHandler,
  ): Promise<BridgeSubmission> {
    let evm: EvmSignerContext;
    try {
      evm = await this.signerFactory(rpcUrl, privateKey);
    } catch (error) {
      throw new SkipServiceError(`Could not connect the EVM signer: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    const resolved = await this.resolveRoute(request);
    if (evm.chainId !== resolved.fromChain.chainId) {
      throw new SkipServiceError(
        `The RPC is connected to EVM chain ${evm.chainId}, but --from-chain resolves to ${resolved.fromChain.chainId}.`,
      );
    }

    const quote = this.quoteResult(
      resolved.route,
      resolved.fromToken,
      resolved.toToken,
      request.slippage,
    );
    await onQuote?.(quote);

    const cosmosSigners = new Map<string, CosmosSigner>();
    const userAddresses = [];
    for (const chainId of resolved.route.requiredChainAddresses) {
      const chain = this.chainById(chainId);
      if (chain.chainType === 'evm') {
        if (chainId !== evm.chainId) {
          throw new SkipServiceError(
            `This route needs an EVM signer on chain ${chainId}; only source chain ${evm.chainId} is configured.`,
          );
        }
        userAddresses.push({ address: evm.address, chainId });
      } else if (chainId === resolved.toChain.chainId) {
        userAddresses.push({ address: request.toAddress, chainId });
      } else if (chain.chainType === 'cosmos') {
        const signer = await cosmosSignerFactory(chain.bech32Prefix);
        const account = (await signer.getAccounts())[0];
        if (!account) throw new SkipServiceError(`The wallet has no account for ${chainId}.`);
        cosmosSigners.set(chainId, signer);
        userAddresses.push({ address: account.address, chainId });
      } else {
        throw new SkipServiceError(`Routes through ${chain.chainType} chains are not supported.`);
      }
    }

    const transactionHashes: Array<{ chainId: string; hash: string }> = [];
    try {
      await this.api.execute({
        getCosmosSigner: async (chainId) => {
          const signer = cosmosSigners.get(chainId);
          if (!signer) throw new Error(`No Cosmos signer configured for ${chainId}.`);
          return signer as Awaited<ReturnType<NonNullable<ExecuteRouteOptions['getCosmosSigner']>>>;
        },
        getEvmSigner: async (chainId) => {
          if (chainId !== evm.chainId) throw new Error(`No EVM signer configured for ${chainId}.`);
          return evm.signer;
        },
        onApproveAllowance: async ({ status }) => {
          await onProgress?.(`ERC-20 approval: ${status}`);
        },
        onTransactionBroadcast: async ({ chainId, txHash }) => {
          transactionHashes.push({ chainId, hash: txHash });
          await onProgress?.(`Broadcast ${chainId}: ${txHash}`);
        },
        onTransactionCompleted: async ({ chainId, txHash }) => {
          await onProgress?.(`Completed ${chainId}: ${txHash}`);
        },
        route: resolved.route as ExecuteRouteOptions['route'],
        slippageTolerancePercent: request.slippage.toString(),
        userAddresses,
      });
    } catch (error) {
      throw new SkipServiceError(`Could not execute the Skip Go route: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    return { ...quote, transactionHashes };
  }

  private asset(chain: SkipChain, reference: string): SkipAsset {
    const candidates = this.assetMap[chain.chainId] ?? [];
    const normalized = reference.toLowerCase();
    const exact = candidates.find(
      (candidate) =>
        candidate.denom.toLowerCase() === normalized ||
        candidate.tokenContract?.toLowerCase() === normalized,
    );
    if (exact) return exact;

    const matches = candidates.filter((candidate) =>
      [candidate.symbol, candidate.recommendedSymbol, candidate.name].some(
        (alias) => alias?.toLowerCase() === normalized,
      ),
    );
    if (matches.length === 1) return matches[0]!;

    const native = matches.find(
      (candidate) =>
        candidate.originChainId === chain.chainId && candidate.originDenom === candidate.denom,
    );
    if (native) return native;

    if (matches.length > 1) {
      throw new SkipServiceError(
        `Token ${reference} is ambiguous on ${chain.prettyName}. Use one of these denoms: ${matches.map((token) => token.denom).join(', ')}.`,
      );
    }
    throw new SkipServiceError(
      `Token ${reference} is not supported on ${chain.prettyName} by Skip Go.`,
    );
  }

  private chain(reference: string): SkipChain {
    const exact = this.chainList.find((candidate) => candidate.chainId === reference);
    if (exact) return exact;

    const normalized = reference.toLowerCase();
    const matches = this.chainList.filter((candidate) =>
      [candidate.chainName, candidate.prettyName].some(
        (alias) => alias.toLowerCase() === normalized,
      ),
    );
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      throw new SkipServiceError(
        `Chain ${reference} is ambiguous. Use one of these chain IDs: ${matches.map((chain) => chain.chainId).join(', ')}.`,
      );
    }
    throw new SkipServiceError(
      `Chain ${reference} is not supported in the Skip Go ${this.environment} registry.`,
    );
  }

  private chainById(chainId: string): SkipChain {
    const chain = this.chainList.find((candidate) => candidate.chainId === chainId);
    if (!chain) throw new SkipServiceError(`Skip Go returned unknown chain ${chainId}.`);
    return chain;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const [chainList, assetMap] = await Promise.all([
        this.api.getChains({ includeEvm: true, onlyTestnets: this.environment === 'testnet' }),
        this.api.getAssets({
          includeEvmAssets: true,
          onlyTestnets: this.environment === 'testnet',
        }),
      ]);
      this.chainList = (chainList ?? []).filter(
        (chain) => chain.isTestnet === (this.environment === 'testnet'),
      );
      this.assetMap = assetMap ?? {};
      this.initialized = true;
    } catch (error) {
      throw new SkipServiceError(`Could not initialize Skip Go: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }

  private quoteResult(
    route: SkipRoute,
    fromToken: SkipAsset,
    toToken: SkipAsset,
    slippage: number,
  ): BridgeQuote {
    const fromDecimals = fromToken.decimals ?? 0;
    const toDecimals = toToken.decimals ?? 0;
    const minimum = applySlippage(route.estimatedAmountOut, slippage);
    return {
      actions: route.operations.map(operationName),
      destinationChainId: route.destAssetChainId,
      estimatedDurationSeconds: route.estimatedRouteDurationSeconds,
      fees: (route.estimatedFees ?? []).map((fee) => {
        const decimals = fee.originAsset.decimals ?? 0;
        return `${fee.feeType ?? fee.bridgeId ?? 'Fee'}: ${formatAtomic(fee.amount ?? '0', decimals)} ${fee.originAsset.symbol ?? fee.originAsset.denom}${fee.usdAmount ? ` ($${fee.usdAmount})` : ''}`;
      }),
      fromAmount: formatAtomic(route.amountIn, fromDecimals),
      fromSymbol: fromToken.symbol ?? fromToken.denom,
      minimumReceived: formatAtomic(minimum, toDecimals),
      priceImpact: route.swapPriceImpactPercent ?? '0',
      requiredChainAddresses: route.requiredChainAddresses,
      sourceChainId: route.sourceAssetChainId,
      toAmount: formatAtomic(route.estimatedAmountOut, toDecimals),
      toSymbol: toToken.symbol ?? toToken.denom,
      transactionsRequired: route.txsRequired,
      ...(route.warning?.message ? { warning: route.warning.message } : {}),
    };
  }

  private async resolveRoute(request: BridgeRequest): Promise<{
    fromChain: SkipChain;
    fromToken: SkipAsset;
    route: SkipRoute;
    toChain: SkipChain;
    toToken: SkipAsset;
  }> {
    await this.initialize();
    const fromChain = this.chain(request.fromChain);
    const toChain = this.chain(request.toChain);
    const fromToken = this.asset(fromChain, request.fromToken);
    const toToken = this.asset(toChain, request.toToken);
    const allowSwaps = this.environment === 'mainnet' || request.allowSwap === true;
    const amountIn = parseHumanAmount(request.amount, fromToken.decimals ?? 0);

    let result: SkipRoute;
    try {
      result = await this.api.getRoute({
        allowMultiTx: true,
        allowSwaps,
        allowUnsafe: false,
        amountIn,
        cumulativeAffiliateFeeBps: '0',
        destAssetChainId: toChain.chainId,
        destAssetDenom: toToken.denom,
        smartRelay: true,
        ...(allowSwaps ? { smartSwapOptions: { evmSwaps: true, splitRoutes: true } } : {}),
        sourceAssetChainId: fromChain.chainId,
        sourceAssetDenom: fromToken.denom,
      });
    } catch (error) {
      throw new SkipServiceError(`Could not get a Skip Go route: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    if (result.doesSwap && !allowSwaps) {
      throw new SkipServiceError('Skip Go returned a route containing a swap. Pass --allow-swap.');
    }
    return { fromChain, fromToken, route: result, toChain, toToken };
  }
}

function applySlippage(amount: string, percent: number): string {
  const basisPoints = BigInt(Math.round(percent * 100));
  return ((BigInt(amount) * (10_000n - basisPoints)) / 10_000n).toString();
}

function collectExplorerLinks(value: unknown): string[] {
  const links = new Set<string>();
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item);
    } else if (entry && typeof entry === 'object') {
      for (const [key, child] of Object.entries(entry)) {
        if (key === 'explorerLink' && typeof child === 'string') links.add(child);
        else visit(child);
      }
    }
  };
  visit(value);
  return [...links];
}

function formatAtomic(amount: string, decimals: number): string {
  if (decimals === 0) return amount;
  const negative = amount.startsWith('-');
  const digits = negative ? amount.slice(1) : amount;
  const padded = digits.padStart(decimals + 1, '0');
  const integer = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function operationName(operation: SkipRoute['operations'][number]): string {
  const key = Object.keys(operation).find(
    (candidate) => !['amountIn', 'amountOut', 'txIndex'].includes(candidate),
  );
  return key ? key.replaceAll(/([A-Z])/g, '-$1').toLowerCase() : 'unknown';
}

function parseHumanAmount(amount: string, decimals: number): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount)) {
    throw new SkipServiceError('Amount must be a positive number.');
  }
  const [integer = '', fraction = ''] = amount.split('.');
  if (fraction.length > decimals) {
    throw new SkipServiceError(
      `Amount must have at most ${decimals} decimal places for the source token.`,
    );
  }
  const atomic = BigInt(`${integer}${fraction.padEnd(decimals, '0')}`);
  if (atomic <= 0n) throw new SkipServiceError('Amount must be greater than zero.');
  return atomic.toString();
}
