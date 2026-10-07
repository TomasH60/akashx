import { Command } from '@oclif/core';
import chalk from 'chalk';
import { getWalletPassword, getWalletPath, walletFileFlag } from '../../lib/wallet-flags.js';
import { WalletService, WalletServiceError } from '../../services/wallet-service.js';

export default class WalletImport extends Command {
  static override description = 'Import a recovery phrase into an encrypted Akash wallet';

  static override examples = [
    'AKASHX_WALLET_PASSWORD="a-long-password" AKASHX_WALLET_MNEMONIC="word ..." <%= config.bin %> wallet import',
  ];

  static override flags = {
    'wallet-file': walletFileFlag,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WalletImport);
    const mnemonic = process.env.AKASHX_WALLET_MNEMONIC;
    if (!mnemonic) {
      this.error('Set AKASHX_WALLET_MNEMONIC to the recovery phrase to import.');
    }

    try {
      const result = await new WalletService().import(
        getWalletPath(flags['wallet-file']),
        getWalletPassword(),
        mnemonic,
      );
      this.log(`${chalk.bold('Wallet:')} ${result.path}`);
      this.log(`${chalk.bold('Address:')} ${chalk.green(result.address)}`);
    } catch (error) {
      if (error instanceof WalletServiceError || error instanceof Error) {
        this.error(error.message);
      }
      throw error;
    }
  }
}
