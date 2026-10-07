import { Command } from '@oclif/core';
import chalk from 'chalk';
import { getWalletPassword, getWalletPath, walletFileFlag } from '../../lib/wallet-flags.js';
import { WalletService, WalletServiceError } from '../../services/wallet-service.js';

export default class WalletCreate extends Command {
  static override description = 'Create an encrypted Akash wallet';

  static override examples = [
    'AKASHX_WALLET_PASSWORD="a-long-password" <%= config.bin %> wallet create',
    'AKASHX_WALLET_PASSWORD="a-long-password" <%= config.bin %> wallet create --wallet-file ./wallet.json',
  ];

  static override flags = {
    'wallet-file': walletFileFlag,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WalletCreate);
    const path = getWalletPath(flags['wallet-file']);

    try {
      const result = await new WalletService().create(path, getWalletPassword());
      this.log(`${chalk.bold('Wallet:')} ${result.path}`);
      this.log(`${chalk.bold('Address:')} ${chalk.green(result.address)}`);
      this.log(`${chalk.bold('Recovery phrase:')} ${result.mnemonic}`);
      this.log(chalk.yellow('Back up the recovery phrase now. It will not be shown again.'));
    } catch (error) {
      if (error instanceof WalletServiceError || error instanceof Error) {
        this.error(error.message);
      }
      throw error;
    }
  }
}
