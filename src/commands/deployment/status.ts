import { Args, Command, Flags } from '@oclif/core';
import { tenantFlags, leaseFlags, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
import { ProviderClient } from '../../services/provider-client.js';
export default class DeploymentStatus extends Command {
  static override description = 'Inspect chain state and optionally provider workload readiness';
  static override args = {
    dseq: Args.string({ required: true, description: 'Deployment sequence' }),
  };
  static override flags = {
    ...tenantFlags,
    ...leaseFlags,
    workload: Flags.boolean({ description: 'Also query the selected lease provider' }),
  };
  async run() {
    const { args, flags } = await this.parse(DeploymentStatus);
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      await service.verifyNetwork();
      const owner = await service.owner();
      this.log(
        json({
          ...(await service.deployment(owner, args.dseq)),
          ...(await service.leases(owner, args.dseq, flags)),
        }),
      );
      if (flags.workload)
        this.log(json(await new ProviderClient(service).status(args.dseq, flags)));
    } finally {
      await service.dispose();
    }
  }
}
