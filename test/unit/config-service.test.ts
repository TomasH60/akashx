import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readConfig, setConfig } from '../../src/services/config-service.js';
import { getConfiguredWalletPath } from '../../src/lib/wallet-flags.js';
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'akashx-config-'));
  vi.stubEnv('AKASHX_CONFIG_DIR', directory);
  vi.stubEnv('AKASHX_WALLET_FILE', '');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it('applies flags over environment over saved configuration', async () => {
  await setConfig('network', 'saved-1');
  vi.stubEnv('AKASHX_NETWORK', 'env-1');
  expect((await readConfig()).network).toBe('env-1');
  expect((await readConfig({ network: 'flag-1' })).network).toBe('flag-1');
});
it('does not persist secrets or unsafe endpoint credentials', async () => {
  await expect(setConfig('privateKey', 'secret')).rejects.toThrow('Invalid configuration');
  await expect(setConfig('rpc', 'https://user:password@example.org')).rejects.toThrow(
    'Invalid rpc',
  );
});
it('uses a saved wallet path across old and new command groups', async () => {
  await setConfig('walletFile', join(directory, 'wallet.json'));
  expect(await getConfiguredWalletPath()).toBe(join(directory, 'wallet.json'));
  vi.stubEnv('AKASHX_WALLET_FILE', join(directory, 'env.json'));
  expect(await getConfiguredWalletPath()).toBe(join(directory, 'env.json'));
  expect(await getConfiguredWalletPath(join(directory, 'flag.json'))).toBe(
    join(directory, 'flag.json'),
  );
});
