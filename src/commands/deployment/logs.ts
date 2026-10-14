import { Args, Command, Flags } from '@oclif/core';
import { tenantFlags, leaseFlags, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
import { ProviderClient } from '../../services/provider-client.js';
export default class DeploymentLogs extends Command {
  static override description = 'Read or follow workload logs from the selected lease';
  static override args = {
    dseq: Args.string({ required: true, description: 'Deployment sequence' }),
  };
  static override flags = {
    ...tenantFlags,
    ...leaseFlags,
    follow: Flags.boolean(),
    tail: Flags.integer({ min: 1, default: 100 }),
  };
  async run() {
    const { args, flags } = await this.parse(DeploymentLogs);
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      await service.verifyNetwork();
      await new ProviderClient(service).logs(args.dseq, flags, flags.follow, flags.tail, (line) =>
        this.log(line),
      );
    } finally {
      await service.dispose();
    }
  }
}
