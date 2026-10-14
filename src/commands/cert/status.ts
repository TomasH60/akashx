import { Args, Command } from '@oclif/core';
import { tenantFlags, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
export default class CertStatus extends Command {
  static override description = 'Show published tenant certificates';
  static override args = { address: Args.string() };
  static override flags = { ...tenantFlags };
  async run() {
    const { args, flags } = await this.parse(CertStatus);
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      await service.verifyNetwork();
      this.log(json(await service.certificates(await service.owner(args.address))));
    } finally {
      await service.dispose();
    }
  }
}
