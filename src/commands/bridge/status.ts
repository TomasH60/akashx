import { Args, Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { SkipService, SkipServiceError } from '../../services/skip-service.js';

export default class BridgeStatus extends Command {
  static override description = 'Check a Skip Go bridge transaction';

  static override args = {
    transaction: Args.string({ description: 'Source transaction hash', required: true }),
  };

  static override examples = ['<%= config.bin %> bridge status 0x... --chain-id 8453'];

  static override flags = {
    'chain-id': Flags.string({
      description: 'Chain ID where the transaction started',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(BridgeStatus);

    try {
      const result = await new SkipService().getBridgeStatus(args.transaction, flags['chain-id']);

      this.log(`${chalk.bold('Status:')} ${chalk.cyan(result.status)}`);
      for (const link of result.explorerLinks) {
        this.log(`${chalk.bold('Explorer:')} ${link}`);
      }
    } catch (error) {
      if (error instanceof SkipServiceError || error instanceof Error) {
        this.error(error.message);
      }
      throw error;
    }
  }
}
