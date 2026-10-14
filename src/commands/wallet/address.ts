import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import {
  getWalletPassword,
  getConfiguredWalletPath,
  walletFileFlag,
} from '../../lib/wallet-flags.js';
import { WalletService, WalletServiceError } from '../../services/wallet-service.js';

export default class WalletAddress extends Command {
  static override description = 'Show a chain address derived from the encrypted wallet';

  static override examples = [
    'AKASHX_WALLET_PASSWORD="a-long-password" <%= config.bin %> wallet address',
  ];

  static override flags = {
    prefix: Flags.string({
      default: 'akash',
      description: 'Address prefix (inj uses Injective-specific key and address derivation)',
      options: ['akash', 'inj', 'osmo', 'noble', 'cosmos'],
    }),
    'wallet-file': walletFileFlag,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(WalletAddress);

    try {
      const result = await new WalletService().loadForPrefix(
        await getConfiguredWalletPath(flags['wallet-file']),
        getWalletPassword(),
        flags.prefix,
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
