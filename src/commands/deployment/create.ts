import { Args, Command, Flags } from '@oclif/core';
import { tenantFlags, yesFlag, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
export default class DeploymentCreate extends Command {
  static override description = 'Create an on-chain deployment and record its identifier';
  static override args = { file: Args.string({ required: true }) };
  static override flags = {
    ...tenantFlags,
    dseq: Flags.string({ required: true }),
    deposit: Flags.string({ required: true }),
    yes: yesFlag,
  };
  async run() {
    const { args, flags } = await this.parse(DeploymentCreate);
    if (!flags.yes) this.error('Pass --yes to authorize this operation.');
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      this.log(json(await service.createDeployment(args.file, flags.dseq, flags.deposit)));
    } finally {
      await service.dispose();
    }
  }
}
