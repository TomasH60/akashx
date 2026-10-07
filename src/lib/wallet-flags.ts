import { Flags } from '@oclif/core';
import { resolveWalletPath } from '../services/wallet-service.js';

export const walletFileFlag = Flags.string({
  description: 'Encrypted wallet file path',
  env: 'AKASHX_WALLET_FILE',
  helpValue: '<path>',
});

export function getWalletPath(path?: string): string {
  return resolveWalletPath(path);
}

export function getWalletPassword(): string {
  const password = process.env.AKASHX_WALLET_PASSWORD;
  if (!password) {
    throw new Error('Set AKASHX_WALLET_PASSWORD to unlock the encrypted wallet.');
  }
  return password;
}
