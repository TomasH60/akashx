import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fromBech32 } from '@cosmjs/encoding';
import { WalletService, WalletServiceError } from '../../src/services/wallet-service.js';

const mnemonic = `${'abandon '.repeat(23)}art`;
const password = 'correct horse battery staple';
const temporaryDirectories: string[] = [];

async function temporaryWalletPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'akashx-wallet-'));
  temporaryDirectories.push(directory);
  return join(directory, 'wallet.json');
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('WalletService', () => {
  it('imports, encrypts, and unlocks an Akash wallet', async () => {
    const path = await temporaryWalletPath();
    const service = new WalletService();

    const imported = await service.import(path, password, mnemonic);
    const stored = await readFile(path, 'utf8');
    const loaded = await service.load(path, password);

    expect(imported.address).toMatch(/^akash1/);
    expect(loaded.address).toBe(imported.address);
    expect((await loaded.signer.getAccounts())[0]?.address).toBe(imported.address);
    expect((await service.loadForPrefix(path, password, 'osmo')).address).toMatch(/^osmo1/);
    expect((await service.loadForPrefix(path, password, 'noble')).address).toMatch(/^noble1/);
    const injective = await service.loadForPrefix(path, password, 'inj');
    expect(injective.address).toMatch(/^inj1/);
    expect((await injective.signer.getAccounts())[0]?.algo).toBe('ethsecp256k1');
    expect(fromBech32(injective.address, 90).data).not.toEqual(
      fromBech32(imported.address, 90).data,
    );
    expect((await service.load(path, password)).address).toBe(imported.address);
    expect(stored).not.toContain('abandon');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('creates a new 24-word wallet and refuses to overwrite it', async () => {
    const path = await temporaryWalletPath();
    const service = new WalletService();

    const created = await service.create(path, password);

    expect(created.address).toMatch(/^akash1/);
    expect(created.mnemonic.split(' ')).toHaveLength(24);
    await expect(service.create(path, password)).rejects.toThrow('already exists');
  });

  it('rejects an incorrect password', async () => {
    const path = await temporaryWalletPath();
    const service = new WalletService();
    await service.import(path, password, mnemonic);

    await expect(service.load(path, 'this password is incorrect')).rejects.toEqual(
      expect.objectContaining<Partial<WalletServiceError>>({
        message: 'Could not unlock the wallet. Check the wallet password.',
      }),
    );
  });
});
