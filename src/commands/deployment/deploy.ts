import { Args, Command, Flags } from '@oclif/core';
import { tenantFlags, yesFlag, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService, address } from '../../services/tenant-service.js';
import { deploy } from '../../services/deploy-workflow.js';
export default class DeploymentDeploy extends Command {
  static override description =
    'Create and deploy to a selected provider, or resume an existing deployment';
  static override args = { file: Args.string({ required: true }) };
  static override flags = {
    ...tenantFlags,
    dseq: Flags.string({ required: true }),
    deposit: Flags.string(),
    provider: Flags.string({ required: true }),
    resume: Flags.boolean(),
    timeout: Flags.integer({
      min: 1,
      default: 300,
      description: 'Wait limit in seconds per stage',
    }),
    yes: yesFlag,
  };
  async run() {
    const { args, flags } = await this.parse(DeploymentDeploy);
    if (!flags.yes) this.error('Pass --yes to authorize deployment transactions.');
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      this.log(
        json(
          await deploy(service, { ...flags, provider: address(flags.provider), file: args.file }),
        ),
      );
    } finally {
      await service.dispose();
    }
  }
}
