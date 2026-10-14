import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultTenantConfig } from '../../src/services/config-service.js';
import { TenantService, allPages, coin, sequence } from '../../src/services/tenant-service.js';
import { WalletService } from '../../src/services/wallet-service.js';
import { ProviderClient } from '../../src/services/provider-client.js';
import { initSDL, loadSDL } from '../../src/services/sdl-service.js';
import { deploy, isReady } from '../../src/services/deploy-workflow.js';

let directory: string;
let service: TenantService;
const owner = 'akash1wxr49evm8hddnx9ujsdtd86gk46s7ejnccqfmy';
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'akashx-tenant-'));
  vi.stubEnv('AKASHX_CONFIG_DIR', directory);
  vi.stubEnv('AKASHX_WALLET_PASSWORD', 'test-password-long');
  service = new TenantService(defaultTenantConfig);
});
afterEach(async () => {
  await service.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('tenant transaction boundaries', () => {
  it('rejects mismatched RPC and gRPC networks before signing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { node_info: { network: 'akashnet-2' } } }),
      }),
    );
    vi.spyOn(service.sdk.cosmos.base.tendermint.v1beta1, 'getLatestBlock').mockResolvedValue({
      block: { header: { chainId: 'sandbox-2' } },
    } as never);
    const unlock = vi.spyOn(WalletService.prototype, 'load');
    await expect(service.submit('test', owner, [])).rejects.toThrow('Network mismatch');
    expect(unlock).not.toHaveBeenCalled();
  });
  it('rejects an ambiguous bid without submitting a lease', async () => {
    vi.spyOn(service, 'owner').mockResolvedValue(owner);
    vi.spyOn(service, 'bids').mockResolvedValue({
      bids: [{ bid: { id: { bseq: 1 } } }, { bid: { id: { bseq: 2 } } }],
    } as never);
    const submit = vi.spyOn(service, 'submit');
    await expect(service.createLease('123', {})).rejects.toThrow('Expected one open bid');
    expect(submit).not.toHaveBeenCalled();
  });
  it('uses the selected bid sequence instead of assuming the first bid', async () => {
    vi.spyOn(service, 'owner').mockResolvedValue(owner);
    const id = { owner, provider: owner, dseq: 123n, gseq: 2, oseq: 3, bseq: 4 };
    vi.spyOn(service, 'bids').mockResolvedValue({ bids: [{ bid: { id } }] } as never);
    const submit = vi
      .spyOn(service, 'submit')
      .mockResolvedValue({ transactionHash: 'hash', code: 0 });
    await service.createLease('123', { bseq: 4 });
    expect(submit.mock.calls[0]?.[2][0]?.data).toEqual({ bidId: id });
  });
  it('refuses a changed SDL before contacting the provider', async () => {
    const file = join(directory, 'web.yaml');
    await initSDL(file);
    vi.spyOn(service, 'owner').mockResolvedValue(owner);
    vi.spyOn(service, 'selectedLease').mockResolvedValue({
      provider: owner,
      dseq: 123n,
      gseq: 1,
      oseq: 1,
    } as never);
    vi.spyOn(service, 'deployment').mockResolvedValue({
      deployment: { hash: new Uint8Array([1]) },
    } as never);
    const provider = new ProviderClient(service);
    const request = vi.spyOn(provider, 'request');
    await expect(provider.manifest(file, '123', {})).rejects.toThrow(
      'manifest hash does not match',
    );
    expect(request).not.toHaveBeenCalled();
  });
  it('persists a creation intent and blocks duplicate creation after an interrupted submission', async () => {
    const file = join(directory, 'web.yaml');
    await initSDL(file);
    vi.spyOn(service, 'owner').mockResolvedValue(owner);
    vi.spyOn(service, 'verifyNetwork').mockResolvedValue({ network: 'sandbox-2', height: 1n });
    vi.spyOn(WalletService.prototype, 'load').mockResolvedValue({ address: owner } as never);
    vi.spyOn(service, 'balances').mockResolvedValue({
      balances: [{ denom: 'uact', amount: '1000000' }],
    });
    vi.spyOn(service.sdk.akash.deployment.v1beta4, 'getParams').mockResolvedValue({
      params: { minDeposits: [{ denom: 'uact', amount: '500000' }] },
    });
    const submit = vi.spyOn(service, 'submit').mockRejectedValue(new Error('connection lost'));
    await expect(service.createDeployment(file, '123', '500000uact')).rejects.toThrow(
      'connection lost',
    );
    const record = JSON.parse(await readFile(service.deploymentPath(owner, '123'), 'utf8'));
    expect(record).toMatchObject({ dseq: '123', owner, status: 'submitting' });
    await expect(service.createDeployment(file, '123', '500000uact')).rejects.toThrow(
      'already has a local creation record',
    );
    expect(submit).toHaveBeenCalledOnce();
  });
  it('does not create or lease again when resuming an active deployment', async () => {
    const file = join(directory, 'web.yaml');
    await initSDL(file);
    const sdl = await loadSDL(file);
    vi.spyOn(service, 'verifyNetwork').mockResolvedValue({ network: 'sandbox-2', height: 1n });
    vi.spyOn(service, 'owner').mockResolvedValue(owner);
    vi.spyOn(service, 'certificate').mockResolvedValue({
      cert: 'cert',
      publicKey: '',
      privateKey: '',
    });
    vi.spyOn(service, 'certificates').mockResolvedValue({
      certificates: [{ certificate: { state: 1, cert: Buffer.from('cert') } }],
    } as never);
    vi.spyOn(service, 'deployment').mockResolvedValue({
      deployment: { state: 1, hash: sdl.hash },
      groups: [{ id: { gseq: 1 } }],
    } as never);
    vi.spyOn(service, 'leases').mockResolvedValue({
      leases: [{ lease: { id: { provider: owner } } }],
    } as never);
    const create = vi.spyOn(service, 'createDeployment');
    const lease = vi.spyOn(service, 'createLease');
    vi.spyOn(ProviderClient.prototype, 'manifest').mockResolvedValue({});
    vi.spyOn(ProviderClient.prototype, 'status').mockResolvedValue({
      services: { web: { total: 2, available: 2 } },
    });
    await expect(
      deploy(service, { file, dseq: '123', provider: owner, resume: true, timeout: 1 }),
    ).resolves.toMatchObject({ status: 'ready' });
    expect(create).not.toHaveBeenCalled();
    expect(lease).not.toHaveBeenCalled();
    expect(await readdir(directory)).toEqual(['web.yaml']);
  });
});

describe('SDL and pagination', () => {
  it('generates a valid template and refuses to overwrite user content', async () => {
    const path = join(directory, 'web.yaml');
    await initSDL(path);
    expect((await loadSDL(path)).groupSpecs).toHaveLength(1);
    await writeFile(path, 'user content');
    await expect(initSDL(path)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(path, 'utf8')).toBe('user content');
  });
  it('reads subsequent pages and detects looping pagination', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], next: Uint8Array.of(1) })
      .mockResolvedValueOnce({ items: [2] });
    expect(await allPages(query)).toEqual([1, 2]);
    await expect(allPages(async () => ({ items: [], next: Uint8Array.of(1) }))).rejects.toThrow(
      'repeated pagination',
    );
  });
  it('does not declare multiple replicas ready after only one starts', () => {
    expect(isReady({ services: { web: { total: 2, available: 1 } } })).toBe(false);
    expect(isReady({ services: { web: { total: 2, available: 2 } } })).toBe(true);
    expect(isReady({ services: {} })).toBe(false);
  });
  it('validates exact monetary and deployment identifiers without floating point', () => {
    expect(sequence('9007199254740993')).toBe(9007199254740993n);
    expect(() => sequence('18446744073709551616')).toThrow();
    expect(() => coin('0.5uakt')).toThrow();
    expect(coin('500000uact')).toEqual({ amount: '500000', denom: 'uact' });
  });
});
