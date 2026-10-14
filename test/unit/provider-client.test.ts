import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import type { PeerCertificate } from 'node:tls';
import { certificateManager } from '@akashnetwork/chain-sdk';
import { expect, it, vi } from 'vitest';
import { TenantService } from '../../src/services/tenant-service.js';
import { ProviderClient } from '../../src/services/provider-client.js';
import { defaultTenantConfig, writePrivateJson } from '../../src/services/config-service.js';
it('pins the provider certificate to its chain identity and rejects a different peer', async () => {
  const owner = 'akash1wxr49evm8hddnx9ujsdtd86gk46s7ejnccqfmy';
  const certificate = await certificateManager.generatePEM(owner);
  const tenant = new TenantService(defaultTenantConfig);
  vi.spyOn(tenant.sdk.akash.provider.v1beta4, 'getProvider').mockResolvedValue({
    provider: { owner, hostUri: 'https://provider.example:8443' },
  } as never);
  vi.spyOn(tenant, 'certificate').mockResolvedValue(certificate);
  vi.spyOn(tenant, 'certificates').mockResolvedValue({
    certificates: [{ certificate: { state: 1, cert: Buffer.from(certificate.cert) } }],
  } as never);
  try {
    const { options } = await new ProviderClient(tenant).connection(owner, owner);
    expect(options.rejectUnauthorized).toBe(true);
    expect(
      options.checkServerIdentity!('provider.example', {
        raw: new X509Certificate(certificate.cert).raw,
      } as PeerCertificate),
    ).toBeUndefined();
    expect(
      options.checkServerIdentity!('provider.example', {
        raw: Buffer.from('other'),
      } as PeerCertificate),
    ).toBeInstanceOf(Error);
  } finally {
    await tenant.dispose();
    vi.restoreAllMocks();
  }
});
it('rejects a local client certificate paired with another private key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'akashx-cert-'));
  vi.stubEnv('AKASHX_CONFIG_DIR', directory);
  const owner = 'akash1wxr49evm8hddnx9ujsdtd86gk46s7ejnccqfmy';
  const tenant = new TenantService(defaultTenantConfig);
  try {
    const first = await certificateManager.generatePEM(owner);
    const second = await certificateManager.generatePEM(owner);
    await writePrivateJson(tenant.certificatePath(owner), first);
    expect((await tenant.certificate(owner)).cert).toBe(first.cert);
    await writePrivateJson(tenant.certificatePath(owner), {
      ...first,
      privateKey: second.privateKey,
    });
    await expect(tenant.certificate(owner)).rejects.toThrow('does not match');
  } finally {
    await tenant.dispose();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
