import { Command } from '@oclif/core';
import { tenantFlags, yesFlag, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig, json } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
export default class CertCreate extends Command {
  static override description = 'Generate a reusable client certificate and publish it';
  static override args = {};
  static override flags = { ...tenantFlags, yes: yesFlag };
  async run() {
    const { flags } = await this.parse(CertCreate);
    if (!flags.yes) this.error('Pass --yes to authorize this operation.');
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      this.log(json(await service.createCertificate()));
    } finally {
      await service.dispose();
    }
  }
}
