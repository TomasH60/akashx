import { spawn } from 'node:child_process';
import { Args, Command, Flags } from '@oclif/core';
import { tenantFlags, leaseFlags, configOverrides } from '../../lib/tenant-flags.js';
import { readConfig } from '../../services/config-service.js';
import { TenantService } from '../../services/tenant-service.js';
import { ProviderClient } from '../../services/provider-client.js';
export default class DeploymentSsh extends Command {
  static override description = 'Connect using system SSH to an SSH workload’s advertised TCP port';
  static override args = { dseq: Args.string({ required: true }) };
  static override flags = {
    ...tenantFlags,
    ...leaseFlags,
    service: Flags.string({ required: true }),
    user: Flags.string({ required: true }),
    identity: Flags.string({ required: true }),
    port: Flags.integer({ min: 1, max: 65535, default: 2222, description: 'Container SSH port' }),
    host: Flags.string({ description: 'Override advertised hostname for a configured local lab' }),
  };
  async run() {
    const { args, flags } = await this.parse(DeploymentSsh);
    const tenant = new TenantService(await readConfig(configOverrides(flags)));
    try {
      await tenant.verifyNetwork();
      const status = (await new ProviderClient(tenant).status(args.dseq, flags)) as {
        forwarded_ports?: Record<
          string,
          { host: string; port: number; externalPort: number; proto: string }[]
        >;
      };
      const ports =
        status.forwarded_ports?.[flags.service]?.filter(
          (port) => port.port === flags.port && port.proto.toLowerCase() === 'tcp',
        ) ?? [];
      if (ports.length !== 1)
        this.error(
          'Expected one forwarded TCP port for this service. Inspect deployment status --workload.',
        );
      const selected = ports[0]!;
      const host = flags.host ?? selected.host;
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(host) ||
        !/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(flags.user) ||
        !Number.isInteger(selected.externalPort) ||
        selected.externalPort < 1 ||
        selected.externalPort > 65535
      )
        this.error('Invalid SSH endpoint.');
      const code = await new Promise<number>((resolve, reject) => {
        const child = spawn(
          'ssh',
          ['-i', flags.identity, '-p', String(selected.externalPort), '-l', flags.user, '--', host],
          { stdio: 'inherit', shell: false },
        );
        child.on('error', reject);
        child.on('exit', (code) => resolve(code ?? 1));
      });
      if (code) this.exit(code);
    } finally {
      await tenant.dispose();
    }
  }
}
