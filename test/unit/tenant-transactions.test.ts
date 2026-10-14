import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
const client = vi.hoisted(() => ({
  estimateFee: vi.fn(),
  sign: vi.fn(),
  broadcast: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock('@akashnetwork/chain-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@akashnetwork/chain-sdk')>()),
  createStargateClient: () => client,
}));
import { msg } from '@akashnetwork/chain-sdk';
import { TenantService } from '../../src/services/tenant-service.js';
import { defaultTenantConfig } from '../../src/services/config-service.js';
import { WalletService } from '../../src/services/wallet-service.js';
let directory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it('saves the signed transaction hash before broadcast and retains it after a timeout', async () => {
  directory = await mkdtemp(join(tmpdir(), 'akashx-tx-'));
  vi.stubEnv('AKASHX_CONFIG_DIR', directory);
  vi.stubEnv('AKASHX_WALLET_PASSWORD', 'test-password-long');
  const owner = 'akash1wxr49evm8hddnx9ujsdtd86gk46s7ejnccqfmy';
  const tenant = new TenantService(defaultTenantConfig);
  vi.spyOn(tenant, 'verifyNetwork').mockResolvedValue({ network: 'sandbox-2', height: 1n });
  vi.spyOn(WalletService.prototype, 'load').mockResolvedValue({
    address: owner,
    signer: {},
  } as never);
  client.estimateFee.mockResolvedValue({ gas: '100', amount: [{ denom: 'uakt', amount: '3' }] });
  client.sign.mockResolvedValue({
    bodyBytes: Uint8Array.of(1),
    authInfoBytes: Uint8Array.of(2),
    signatures: [Uint8Array.of(3)],
  });
  client.broadcast.mockImplementation(async () => {
    const records = await readdir(join(directory!, 'transactions'));
    const record = JSON.parse(
      await readFile(join(directory!, 'transactions', records[0]!), 'utf8'),
    );
    expect(record.status).toBe('signed');
    expect(record.transactionHash).toMatch(/^[A-F0-9]{64}$/);
    expect(record).not.toHaveProperty('privateKey');
    expect(record).not.toHaveProperty('mnemonic');
    throw new Error('broadcast timed out');
  });
  try {
    await expect(
      tenant.submit('deployment-close-123', owner, [
        msg(tenant.sdk.akash.deployment.v1beta4.closeDeployment, { id: { owner, dseq: 123n } }),
      ]),
    ).rejects.toThrow('broadcast timed out');
    expect(client.broadcast).toHaveBeenCalledOnce();
    expect(client.disconnect).toHaveBeenCalledOnce();
  } finally {
    await tenant.dispose();
  }
});
it('blocks another submission while the preceding signed transaction is unresolved', async () => {
  directory = await mkdtemp(join(tmpdir(), 'akashx-pending-'));
  vi.stubEnv('AKASHX_CONFIG_DIR', directory);
  const { writePrivateJson } = await import('../../src/services/config-service.js');
  const owner = 'akash1wxr49evm8hddnx9ujsdtd86gk46s7ejnccqfmy';
  await writePrivateJson(join(directory, 'transactions', 'previous.json'), {
    network: 'sandbox-2',
    owner,
    operation: 'mint-act-5000000uakt',
    status: 'signed',
    transactionHash: 'ABC123',
  });
  const tenant = new TenantService(defaultTenantConfig);
  vi.spyOn(tenant, 'verifyNetwork').mockResolvedValue({ network: 'sandbox-2', height: 1n });
  vi.spyOn(tenant.sdk.cosmos.tx.v1beta1, 'getTx').mockRejectedValue(new Error('not found'));
  const load = vi.spyOn(WalletService.prototype, 'load');
  try {
    await expect(tenant.submit('mint-act-5000000uakt', owner, [])).rejects.toThrow(
      'unresolved inclusion',
    );
    expect(load).not.toHaveBeenCalled();
  } finally {
    await tenant.dispose();
  }
});
