import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import type { ConnectionOptions } from 'node:tls';
import WebSocket from 'ws';
import type { TenantService, LeaseSelection } from './tenant-service.js';
import { loadSDL } from './sdl-service.js';

export class ProviderClient {
  constructor(readonly tenant: TenantService) {}
  async connection(provider: string, owner: string) {
    const response = await this.tenant.sdk.akash.provider.v1beta4.getProvider({ owner: provider });
    if (!response.provider || response.provider.owner !== provider)
      throw new Error('Provider not found on selected chain.');
    const url = new URL(response.provider.hostUri);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Provider must advertise an HTTPS URL without credentials.');
    const cert = await this.tenant.certificate(owner);
    const options: ConnectionOptions = {
      cert: cert.cert,
      key: cert.privateKey,
      rejectUnauthorized: true,
    };
    if (this.tenant.config.providerCa) options.ca = await readFile(this.tenant.config.providerCa);
    else {
      const published = await this.tenant.certificates(provider);
      const valid = published.certificates.flatMap((item) => {
        if (item.certificate?.state !== 1) return [];
        const pem = Buffer.from(item.certificate.cert).toString();
        const parsed = new X509Certificate(pem);
        if (Date.parse(parsed.validTo) <= Date.now() || Date.parse(parsed.validFrom) > Date.now())
          return [];
        return [{ pem, raw: parsed.raw }];
      });
      if (!valid.length)
        throw new Error(
          'Provider has no valid on-chain TLS certificate. Configure providerCa only for a separately trusted CA.',
        );
      options.ca = valid.map((item) => item.pem);
      // Akash self-signed certificates identify the provider account, not its DNS name.
      options.checkServerIdentity = (_host, peer) =>
        valid.some((item) => item.raw.equals(peer.raw))
          ? undefined
          : new Error('Provider TLS certificate does not match its on-chain identity.');
    }
    return { url, options };
  }
  async request(provider: string, owner: string, path: string, body?: string): Promise<unknown> {
    const { url, options } = await this.connection(provider, owner);
    return new Promise((resolve, reject) => {
      const req = request(
        new URL(path, url),
        {
          ...options,
          method: body === undefined ? 'GET' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          timeout: 30_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 8 * 1024 * 1024) req.destroy(new Error('Provider response exceeds 8 MiB.'));
            else chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`Provider HTTP ${res.statusCode}: ${text.slice(0, 1000)}`));
              return;
            }
            try {
              resolve(text ? JSON.parse(text) : { status: 'accepted' });
            } catch {
              resolve(text);
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('Provider request timed out.')));
      req.on('error', reject);
      req.end(body);
    });
  }
  async status(dseq: string, selection: LeaseSelection) {
    const owner = await this.tenant.owner();
    const lease = await this.tenant.selectedLease(owner, dseq, selection);
    return this.request(
      lease.provider,
      owner,
      `/lease/${lease.dseq}/${lease.gseq}/${lease.oseq}/status`,
    );
  }
  async manifest(file: string, dseq: string, selection: LeaseSelection) {
    const owner = await this.tenant.owner();
    const lease = await this.tenant.selectedLease(owner, dseq, selection);
    const sdl = await loadSDL(file);
    const current = await this.tenant.deployment(owner, dseq);
    if (!current.deployment || !Buffer.from(current.deployment.hash).equals(Buffer.from(sdl.hash)))
      throw new Error(
        'SDL manifest hash does not match the on-chain deployment. Use the original SDL.',
      );
    return this.request(lease.provider, owner, `/deployment/${lease.dseq}/manifest`, sdl.manifest);
  }
  async logs(
    dseq: string,
    selection: LeaseSelection,
    follow: boolean,
    tail: number,
    log: (line: string) => void,
  ) {
    const owner = await this.tenant.owner();
    const lease = await this.tenant.selectedLease(owner, dseq, selection);
    const { url, options } = await this.connection(lease.provider, owner);
    const target = new URL(`/lease/${lease.dseq}/${lease.gseq}/${lease.oseq}/logs`, url);
    target.protocol = 'wss:';
    target.search = new URLSearchParams({ follow: String(follow), tail: String(tail) }).toString();
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(target, {
        ...options,
        handshakeTimeout: 15_000,
        maxPayload: 8 * 1024 * 1024,
      });
      const timeout = follow
        ? undefined
        : setTimeout(() => {
            socket.terminate();
            reject(new Error('Log request timed out.'));
          }, 30_000);
      const stop = () => socket.close();
      process.once('SIGINT', stop);
      const cleanup = () => {
        clearTimeout(timeout);
        process.removeListener('SIGINT', stop);
      };
      socket.on('message', (data) => log(data.toString()));
      socket.on('error', (error) => {
        cleanup();
        reject(error);
      });
      socket.on('close', (code, reason) => {
        cleanup();
        if (code === 1000 || code === 1005) resolve();
        else reject(new Error(`Provider log stream closed (${code}): ${reason.toString()}`));
      });
    });
  }
}
