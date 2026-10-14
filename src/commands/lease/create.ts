import { Args, Command, Flags } from '@oclif/core';
import { tenantFlags, leaseFlags, yesFlag, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
export default class LeaseCreate extends Command {
  static override description = 'Accept exactly one matching open bid';
  static override args = {
    dseq: Args.string({ required: true, description: 'Deployment sequence' }),
  };
  static override flags = {
    ...tenantFlags,
    ...leaseFlags,
    bseq: Flags.integer({ min: 1 }),
    yes: yesFlag,
  };
  async run() {
    const { args, flags } = await this.parse(LeaseCreate);
    if (!flags.yes) this.error('Pass --yes to authorize this operation.');
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      this.log(json(await service.createLease(args.dseq, flags)));
    } finally {
      await service.dispose();
    }
  }
}
