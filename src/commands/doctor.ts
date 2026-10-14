import { Command } from '@oclif/core';
import { tenantFlags, configOverrides } from '../lib/tenant-flags.js';
import { readConfig, json } from '../services/config-service.js';
import { AkashService } from '../services/akash-service.js';
import { TenantService } from '../services/tenant-service.js';
export default class Doctor extends Command {
  static override description = 'Check chain connectivity and tenant deployment prerequisites';
  static override args = {};
  static override flags = { ...tenantFlags };
  async run() {
    const { flags } = await this.parse(Doctor);
    const service = new TenantService(await readConfig(configOverrides(flags)), (line) =>
      this.log(line),
    );
    try {
      const checks: { check: string; ok: boolean; detail: unknown }[] = [];
      const check = async (name: string, operation: () => Promise<unknown>) => {
        try {
          checks.push({ check: name, ok: true, detail: await operation() });
        } catch (error) {
          checks.push({
            check: name,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      };
      await check('network', () => service.verifyNetwork());
      await check('wallet', () => service.owner());
      await check('balances', async () => {
        const result = await service.balances(await service.owner());
        if (!result.balances.some((item) => item.denom === 'uakt' && BigInt(item.amount) > 0n))
          throw new Error(
            'No AKT available for transaction fees. Fund this wallet on the selected chain.',
          );
        return result;
      });
      if (service.config.provider)
        await check('provider', () =>
          new AkashService(undefined, {
            name: service.config.network,
            grpcEndpoint: service.config.grpc,
          }).getProviderStatus(service.config.provider!),
        );
      await check('deployment parameters', () =>
        service.sdk.akash.deployment.v1beta4.getParams({}),
      );
      await check('local certificate', async () => {
        await service.certificate(await service.owner());
        return 'Present and unexpired';
      });
      await check('published certificate', async () => {
        const owner = await service.owner();
        const local = await service.certificate(owner);
        const published = await service.certificates(owner);
        if (
          !published.certificates.some(
            (item) =>
              item.certificate?.state === 1 &&
              Buffer.from(item.certificate.cert).equals(Buffer.from(local.cert)),
          )
        )
          throw new Error(
            'Local certificate is not published or is revoked. Run cert create --yes.',
          );
        return 'Published';
      });
      this.log(json(checks));
      if (checks.some((item) => !item.ok)) this.exit(1);
    } finally {
      await service.dispose();
    }
  }
}
