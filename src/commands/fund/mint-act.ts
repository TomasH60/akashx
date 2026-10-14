import { Args, Command } from '@oclif/core';
import { tenantFlags, yesFlag, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
export default class FundMintAct extends Command {
  static override description = 'Burn the specified uakt amount to mint ACT; retain AKT for gas';
  static override args = {
    amount: Args.string({ required: true, description: 'Amount to burn, e.g. 5000000uakt' }),
  };
  static override flags = { ...tenantFlags, yes: yesFlag };
  async run() {
    const { args, flags } = await this.parse(FundMintAct);
    if (!flags.yes) this.error('Pass --yes to authorize this operation.');
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      this.log(json(await service.mint(args.amount)));
      this.log(
        'Minting may settle asynchronously. Check wallet balance before creating a deployment.',
      );
    } finally {
      await service.dispose();
    }
  }
}
