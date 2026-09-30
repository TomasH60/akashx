import { Args, Command } from '@oclif/core';
import chalk from 'chalk';
import { AkashService, AkashServiceError } from '../../services/akash-service.js';

export default class ProviderStatus extends Command {
  static override description = 'Check a provider on the Akash sandbox network';

  static override args = {
    provider: Args.string({ description: 'Provider address (or set AKASHX_PROVIDER)' }),
  };

  static override examples = [
    '<%= config.bin %> provider status akash1...',
    'AKASHX_PROVIDER=akash1... <%= config.bin %> provider status',
  ];

  async run(): Promise<void> {
    const { args } = await this.parse(ProviderStatus);
    const provider = args.provider ?? process.env.AKASHX_PROVIDER;

    if (!provider) {
      this.error('Provide a provider address or set AKASHX_PROVIDER.');
    }

    try {
      const result = await new AkashService().getProviderStatus(provider);
      this.log(`${chalk.bold('Network:')} ${chalk.cyan(result.network)}`);
      this.log(`${chalk.bold('Provider:')} ${chalk.yellow(result.provider)}`);
      this.log(`${chalk.bold('Status:')} ${chalk.green(result.status)}`);
    } catch (error) {
      if (error instanceof AkashServiceError) {
        this.error(error.message);
      }
      throw error;
    }
  }
}
