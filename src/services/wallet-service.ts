import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { DirectSecp256k1HdWallet, type OfflineDirectSigner } from '@cosmjs/proto-signing';
import { createInjectiveSigner } from './injective-signer.js';

const ADDRESS_PREFIX = 'akash';
const CIPHER = 'aes-256-gcm';
const KEY_LENGTH = 32;
const MINIMUM_PASSWORD_LENGTH = 12;
const SCRYPT_COST = 16_384;

interface WalletPayload {
  readonly mnemonic: string;
}

interface WalletFile {
  readonly address: string;
  readonly crypto: {
    readonly authTag: string;
    readonly cipher: typeof CIPHER;
    readonly ciphertext: string;
    readonly iv: string;
    readonly kdf: 'scrypt';
    readonly salt: string;
  };
  readonly version: 1;
}

export interface CreatedWallet {
  readonly address: string;
  readonly mnemonic: string;
  readonly path: string;
}

export interface ImportedWallet {
  readonly address: string;
  readonly path: string;
}

export interface LoadedWallet extends ImportedWallet {
  readonly signer: OfflineDirectSigner;
}

export class WalletServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WalletServiceError';
  }
}

export function getDefaultWalletPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME ?? resolve(homedir(), '.config');
  return resolve(configHome, 'akashx', 'wallet.json');
}

export function resolveWalletPath(path?: string): string {
  return resolve(path ?? process.env.AKASHX_WALLET_FILE ?? getDefaultWalletPath());
}

export class WalletService {
  async create(path: string, password: string): Promise<CreatedWallet> {
    this.validatePassword(password);

    const signer = await DirectSecp256k1HdWallet.generate(24, { prefix: ADDRESS_PREFIX });
    const address = await this.getSignerAddress(signer);
    await this.write(path, password, signer.mnemonic, address);

    return { address, mnemonic: signer.mnemonic, path };
  }

  async import(path: string, password: string, mnemonic: string): Promise<ImportedWallet> {
    this.validatePassword(password);

    const normalizedMnemonic = mnemonic.trim().replaceAll(/\s+/g, ' ');
    let signer: DirectSecp256k1HdWallet;
    try {
      signer = await DirectSecp256k1HdWallet.fromMnemonic(normalizedMnemonic, {
        prefix: ADDRESS_PREFIX,
      });
    } catch (error) {
      throw new WalletServiceError('The recovery phrase is not a valid BIP-39 mnemonic.', {
        cause: error,
      });
    }

    const address = await this.getSignerAddress(signer);
    await this.write(path, password, normalizedMnemonic, address);
    return { address, path };
  }

  async load(path: string, password: string): Promise<LoadedWallet> {
    return this.loadForPrefix(path, password, ADDRESS_PREFIX);
  }

  async loadForPrefix(path: string, password: string, prefix: string): Promise<LoadedWallet> {
    const walletFile = await this.read(path);
    const mnemonic = this.decryptMnemonic(walletFile, password);
    const akashSigner = await this.signerFromMnemonic(mnemonic, ADDRESS_PREFIX);
    const storedAddress = await this.getSignerAddress(akashSigner);
    if (storedAddress !== walletFile.address) {
      throw new WalletServiceError('The wallet file address does not match its encrypted key.');
    }

    const signer =
      prefix === ADDRESS_PREFIX
        ? akashSigner
        : prefix === 'inj'
          ? await createInjectiveSigner(mnemonic)
          : await this.signerFromMnemonic(mnemonic, prefix);
    return { address: await this.getSignerAddress(signer), path, signer };
  }

  private decryptMnemonic(walletFile: WalletFile, password: string): string {
    let payload: WalletPayload;
    try {
      const salt = Buffer.from(walletFile.crypto.salt, 'base64');
      const iv = Buffer.from(walletFile.crypto.iv, 'base64');
      const authTag = Buffer.from(walletFile.crypto.authTag, 'base64');
      const ciphertext = Buffer.from(walletFile.crypto.ciphertext, 'base64');
      const key = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST });
      const decipher = createDecipheriv(CIPHER, key, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      payload = JSON.parse(plaintext.toString('utf8')) as WalletPayload;
    } catch (error) {
      throw new WalletServiceError('Could not unlock the wallet. Check the wallet password.', {
        cause: error,
      });
    }

    if (typeof payload.mnemonic !== 'string') {
      throw new WalletServiceError('The wallet file contains invalid encrypted data.');
    }
    return payload.mnemonic;
  }

  private async getSignerAddress(signer: OfflineDirectSigner): Promise<string> {
    const account = (await signer.getAccounts())[0];
    if (!account) throw new WalletServiceError('The wallet has no accounts.');
    return account.address;
  }

  private async signerFromMnemonic(
    mnemonic: string,
    prefix: string,
  ): Promise<DirectSecp256k1HdWallet> {
    try {
      return await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    } catch (error) {
      throw new WalletServiceError('The wallet file contains an invalid recovery phrase.', {
        cause: error,
      });
    }
  }

  private async read(path: string): Promise<WalletFile> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch (error) {
      throw new WalletServiceError(`Could not read wallet at ${path}.`, { cause: error });
    }

    if (!isWalletFile(value)) {
      throw new WalletServiceError(`The wallet file at ${path} has an unsupported format.`);
    }
    return value;
  }

  private validatePassword(password: string): void {
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      throw new WalletServiceError(
        `AKASHX_WALLET_PASSWORD must contain at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
      );
    }
  }

  private async write(
    path: string,
    password: string,
    mnemonic: string,
    address: string,
  ): Promise<void> {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST });
    const cipher = createCipheriv(CIPHER, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify({ mnemonic } satisfies WalletPayload), 'utf8'),
      cipher.final(),
    ]);
    const walletFile: WalletFile = {
      address,
      crypto: {
        authTag: cipher.getAuthTag().toString('base64'),
        cipher: CIPHER,
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        kdf: 'scrypt',
        salt: salt.toString('base64'),
      },
      version: 1,
    };

    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    try {
      const handle = await open(path, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(walletFile, undefined, 2)}\n`, 'utf8');
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (hasCode(error, 'EEXIST')) {
        throw new WalletServiceError(`A wallet already exists at ${path}.`);
      }
      throw new WalletServiceError(`Could not write wallet to ${path}.`, { cause: error });
    }
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isWalletFile(value: unknown): value is WalletFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WalletFile>;
  const crypto = candidate.crypto;
  return (
    candidate.version === 1 &&
    typeof candidate.address === 'string' &&
    !!crypto &&
    crypto.cipher === CIPHER &&
    crypto.kdf === 'scrypt' &&
    typeof crypto.authTag === 'string' &&
    typeof crypto.ciphertext === 'string' &&
    typeof crypto.iv === 'string' &&
    typeof crypto.salt === 'string'
  );
}
