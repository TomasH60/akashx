import { Args, Command } from '@oclif/core';
import { tenantFlags, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
export default class WalletBalance extends Command {
  static override description = 'Show balances on the selected Akash chain';
  static override args = { address: Args.string() };
  static override flags = { ...tenantFlags };
  async run() {
    const { args, flags } = await this.parse(WalletBalance);
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      await service.verifyNetwork();
      const owner = await service.owner(args.address);
      this.log(json({ owner, ...(await service.balances(owner)) }));
    } finally {
      await service.dispose();
    }
  }
}
