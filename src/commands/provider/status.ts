import { Args, Command } from '@oclif/core';
import chalk from 'chalk';
import { tenantFlags, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig } from '../../services/config-service.js';
import { AkashService, AkashServiceError } from '../../services/akash-service.js';

export default class ProviderStatus extends Command {
  static override description = 'Check a provider on the configured Akash network';

  static override flags = tenantFlags;

  static override args = {
    provider: Args.string({ description: 'Provider address (or set AKASHX_PROVIDER)' }),
  };

  static override examples = [
    '<%= config.bin %> provider status akash1...',
    'AKASHX_PROVIDER=akash1... <%= config.bin %> provider status',
  ];

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProviderStatus);
    const config = await readConfig(configOverrides(flags));
    const provider = args.provider ?? config.provider;

    if (!provider) {
      this.error('Provide a provider address or set AKASHX_PROVIDER.');
    }

    try {
      const result = await new AkashService(undefined, {
        name: config.network,
        grpcEndpoint: config.grpc,
      }).getProviderStatus(provider);
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
