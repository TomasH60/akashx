import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export interface TenantConfig {
  network: string;
  rpc: string;
  grpc: string;
  gasPrice: string;
  walletFile?: string;
  provider?: string;
  providerCa?: string;
}
export const defaultTenantConfig: TenantConfig = {
  network: 'sandbox-2',
  rpc: 'https://rpc.sandbox-2.aksh.pw:443',
  grpc: 'https://grpc.sandbox-2.aksh.pw:443',
  gasPrice: '0.025uakt',
};
export function dataDirectory(): string {
  return resolve(
    process.env.AKASHX_CONFIG_DIR ??
      join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'akashx'),
  );
}
export const configKeys = [
  'network',
  'rpc',
  'grpc',
  'gasPrice',
  'walletFile',
  'provider',
  'providerCa',
] as const;
export function validateConfig(value: unknown): asserts value is Partial<TenantConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid CLI configuration.');
  for (const [key, item] of Object.entries(value)) {
    if (
      !configKeys.includes(key as (typeof configKeys)[number]) ||
      typeof item !== 'string' ||
      !item.trim()
    )
      throw new Error(`Invalid configuration entry: ${key}`);
    if (key === 'rpc' || key === 'grpc') {
      const url = new URL(item);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error(`Invalid ${key} URL.`);
    }
    if (key === 'network' && !/^[a-zA-Z0-9_-]+$/.test(item))
      throw new Error('Invalid network chain ID.');
    if (key === 'gasPrice' && !/^(?:0|[1-9]\d*)(?:\.\d+)?uakt$/.test(item))
      throw new Error('gasPrice must be a decimal amount followed by uakt.');
  }
}
export async function readConfig(overrides: Partial<TenantConfig> = {}): Promise<TenantConfig> {
  let stored: unknown = {};
  try {
    stored = JSON.parse(await readFile(join(dataDirectory(), 'config.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  validateConfig(stored);
  const env: Partial<TenantConfig> = {};
  const names = {
    network: 'AKASHX_NETWORK',
    rpc: 'AKASHX_RPC_URL',
    grpc: 'AKASHX_GRPC_URL',
    walletFile: 'AKASHX_WALLET_FILE',
    provider: 'AKASHX_PROVIDER',
    providerCa: 'AKASHX_PROVIDER_CA',
    gasPrice: 'AKASHX_GAS_PRICE',
  } as const;
  for (const [key, name] of Object.entries(names))
    if (process.env[name]) env[key as keyof TenantConfig] = process.env[name];
  const config = { ...defaultTenantConfig, ...stored, ...env, ...overrides };
  validateConfig(config);
  return config;
}
export async function setConfig(key: string, value: string): Promise<void> {
  const path = join(dataDirectory(), 'config.json');
  let current: unknown = {};
  try {
    current = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  validateConfig(current);
  const next = {
    ...current,
    [key]: ['walletFile', 'providerCa'].includes(key) ? resolve(value) : value,
  };
  validateConfig(next);
  await writePrivateJson(path, next);
}
export function json(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item: unknown) =>
      typeof item === 'bigint'
        ? item.toString()
        : item instanceof Uint8Array
          ? Buffer.from(item).toString('base64')
          : item,
    2,
  );
}
export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, json(value) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}
