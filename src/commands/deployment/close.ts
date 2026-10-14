import { Args, Command } from '@oclif/core';
import { tenantFlags, yesFlag, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
export default class DeploymentClose extends Command {
  static override description = 'Close a deployment and stop its leases';
  static override args = {
    dseq: Args.string({ required: true, description: 'Deployment sequence' }),
  };
  static override flags = { ...tenantFlags, yes: yesFlag };
  async run() {
    const { args, flags } = await this.parse(DeploymentClose);
    if (!flags.yes) this.error('Pass --yes to authorize this operation.');
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      this.log(json(await service.close(args.dseq)));
    } finally {
      await service.dispose();
    }
  }
}
