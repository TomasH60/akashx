import { Args, Command } from '@oclif/core';
import { tenantFlags, leaseFlags, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
export default class DeploymentBids extends Command {
  static override description = 'List open bids for a deployment';
  static override args = {
    dseq: Args.string({ required: true, description: 'Deployment sequence' }),
  };
  static override flags = { ...tenantFlags, ...leaseFlags };
  async run() {
    const { args, flags } = await this.parse(DeploymentBids);
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      await service.verifyNetwork();
      this.log(json(await service.bids(await service.owner(), args.dseq, flags)));
    } finally {
      await service.dispose();
    }
  }
}
