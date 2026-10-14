import { Args, Command } from '@oclif/core';
import { tenantFlags, leaseFlags, yesFlag, configOverrides } from '../../../lib/tenant-flags.js';
import { readConfig, json } from '../../../services/config-service.js';
import { TenantService } from '../../../services/tenant-service.js';
import { ProviderClient } from '../../../services/provider-client.js';
export default class DeploymentManifestSend extends Command {
  static override description = 'Send the matching SDL manifest to an active lease provider';
  static override args = {
    file: Args.string({ required: true }),
    dseq: Args.string({ required: true }),
  };
  static override flags = { ...tenantFlags, ...leaseFlags, yes: yesFlag };
  async run() {
    const { args, flags } = await this.parse(DeploymentManifestSend);
    if (!flags.yes) this.error('Pass --yes to authorize this operation.');
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      await service.verifyNetwork();
      this.log(json(await new ProviderClient(service).manifest(args.file, args.dseq, flags)));
    } finally {
      await service.dispose();
    }
  }
}
