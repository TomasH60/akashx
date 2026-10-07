import { Command } from '@oclif/core';
import chalk from 'chalk';
import { getWalletPassword, getWalletPath, walletFileFlag } from '../../lib/wallet-flags.js';
import { WalletService, WalletServiceError } from '../../services/wallet-service.js';

export default class WalletAddress extends Command {
  static override description = 'Show the address of an encrypted Akash wallet';

  static override examples = [
    'AKASHX_WALLET_PASSWORD="a-long-password" <%= config.bin %> wallet address',
  ];

  static override flags = {
    'wallet-file': walletFileFlag,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WalletAddress);

    try {
      const result = await new WalletService().load(
        getWalletPath(flags['wallet-file']),
        getWalletPassword(),
      );
      this.log(`${chalk.bold('Address:')} ${chalk.green(result.address)}`);
    } catch (error) {
      if (error instanceof WalletServiceError || error instanceof Error) {
        this.error(error.message);
      }
      throw error;
    }
  }
}
