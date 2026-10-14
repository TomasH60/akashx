import { setTimeout as delay } from 'node:timers/promises';
import type { TenantService } from './tenant-service.js';
import { ProviderClient } from './provider-client.js';
import { loadSDL } from './sdl-service.js';

export function isReady(value: unknown): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    !('services' in value) ||
    !value.services ||
    typeof value.services !== 'object'
  )
    return false;
  const services = Object.values(value.services) as {
    available?: number;
    total?: number;
    ready_replicas?: number;
    total_replicas?: number;
  }[];
  return (
    services.length > 0 &&
    services.every((service) => {
      const desired = service.total ?? service.total_replicas;
      const ready = service.available ?? service.ready_replicas;
      return desired !== undefined && desired > 0 && ready !== undefined && ready >= desired;
    })
  );
}
export async function waitFor<T>(
  label: string,
  timeout: number,
  poll: () => Promise<T | undefined>,
  log: (line: string) => void,
): Promise<T> {
  const deadline = Date.now() + timeout * 1000;
  while (true) {
    const result = await poll();
    if (result !== undefined) return result;
    if (Date.now() >= deadline)
      throw new Error(
        `Timed out waiting for ${label}. The deployment remains open; inspect it, resume, or close it.`,
      );
    log(`Waiting for ${label}...`);
    await delay(Math.min(5000, Math.max(1, deadline - Date.now())));
  }
}
export async function deploy(
  service: TenantService,
  options: {
    file: string;
    dseq: string;
    deposit?: string | undefined;
    provider: string;
    resume: boolean;
    timeout: number;
  },
) {
  await service.verifyNetwork();
  const sdl = await loadSDL(options.file);
  const owner = await service.owner();
  // Certificate publication is an explicit prerequisite rather than a hidden paid operation.
  const local = await service.certificate(owner);
  const published = await service.certificates(owner);
  if (
    !published.certificates.some(
      (item) =>
        item.certificate?.state === 1 &&
        Buffer.from(item.certificate.cert).equals(Buffer.from(local.cert)),
    )
  )
    throw new Error('Run cert create --yes before deploying.');
  if (!options.resume) {
    if (!options.deposit) throw new Error('--deposit is required for a new deployment.');
    await service.createDeployment(options.file, options.dseq, options.deposit);
  }
  const current = await service.deployment(owner, options.dseq);
  if (
    current.deployment?.state !== 1 ||
    !Buffer.from(current.deployment.hash).equals(Buffer.from(sdl.hash))
  )
    throw new Error(
      'Deployment is not active or its SDL hash differs. Resume never creates or replaces a deployment.',
    );
  const provider = new ProviderClient(service);
  for (const group of current.groups) {
    if (!group.id) throw new Error('Chain returned a group without an ID.');
    const selection = { provider: options.provider, gseq: group.id.gseq };
    const existing = await service.leases(owner, options.dseq, { gseq: group.id.gseq });
    if (existing.leases.some((item) => item.lease?.id?.provider !== options.provider))
      throw new Error(
        'An active lease already uses a different provider. Inspect deployment status.',
      );
    if (!existing.leases.length) {
      const bid = await waitFor(
        'a provider bid',
        options.timeout,
        async () => {
          const bids = await service.bids(owner, options.dseq, selection);
          if (bids.bids.length > 1)
            throw new Error(
              'Multiple matching bids; use lease create with explicit sequences, then resume.',
            );
          return bids.bids[0]?.bid?.id;
        },
        service.log,
      );
      await service.createLease(options.dseq, { ...selection, oseq: bid.oseq, bseq: bid.bseq });
    }
    await provider.manifest(options.file, options.dseq, selection);
    const status = await waitFor(
      'workload readiness',
      options.timeout,
      async () => {
        const value = await provider.status(options.dseq, selection);
        return isReady(value) ? value : undefined;
      },
      service.log,
    );
    service.log(JSON.stringify(status));
  }
  return { owner, dseq: options.dseq, status: 'ready' };
}
