import { describe, expect, it, vi } from 'vitest';
import { AkashService, type AkashApi } from '../src/services/akash-service.js';

const provider = 'akash1wxr49evm8hddnx9ujsdtd86gk46s7ejnccqfmy';

function mockApi(): AkashApi {
  return {
    getProvider: vi.fn().mockResolvedValue({
      owner: provider,
      hostUri: 'https://provider.example.com:8443',
    }),
    getStatus: vi.fn().mockResolvedValue({ errors: [] }),
  };
}

describe('AkashService', () => {
  it('queries the sandbox chain and the provider gateway', async () => {
    const api = mockApi();
    const service = new AkashService(api);

    await expect(service.getProviderStatus(provider)).resolves.toEqual({
      network: 'sandbox-2',
      provider,
      status: 'online',
    });
    expect(api.getProvider).toHaveBeenCalledWith(provider, 'https://grpc.sandbox-2.aksh.pw:443');
    expect(api.getStatus).toHaveBeenCalledWith('https://provider.example.com:8444');
  });

  it('rejects malformed addresses before querying the chain', async () => {
    const api = mockApi();
    await expect(new AkashService(api).getProviderStatus('invalid')).rejects.toThrow(
      'A valid Akash provider address is required.',
    );
    expect(api.getProvider).not.toHaveBeenCalled();
  });

  it('reports a provider missing from the sandbox chain', async () => {
    const api = mockApi();
    vi.mocked(api.getProvider).mockResolvedValue(undefined);

    await expect(new AkashService(api).getProviderStatus(provider)).rejects.toThrow(
      `Provider ${provider} was not found on sandbox-2.`,
    );
    expect(api.getStatus).not.toHaveBeenCalled();
  });

  it('reports a failed chain query', async () => {
    const api = mockApi();
    vi.mocked(api.getProvider).mockRejectedValue(new Error('connection refused'));

    await expect(new AkashService(api).getProviderStatus(provider)).rejects.toThrow(
      'Could not query sandbox-2: connection refused',
    );
  });

  it('rejects an invalid on-chain gateway URL', async () => {
    const api = mockApi();
    vi.mocked(api.getProvider).mockResolvedValue({
      owner: provider,
      hostUri: 'file:///etc/passwd',
    });

    await expect(new AkashService(api).getProviderStatus(provider)).rejects.toThrow(
      'Provider has an invalid gateway URL.',
    );
    expect(api.getStatus).not.toHaveBeenCalled();
  });

  it('reports an unavailable provider', async () => {
    const api = mockApi();
    vi.mocked(api.getStatus).mockRejectedValue(new Error('connection refused'));

    await expect(new AkashService(api).getProviderStatus(provider)).rejects.toThrow(
      `Provider ${provider} is unavailable: connection refused`,
    );
  });

  it('does not report online when the provider reports errors', async () => {
    const api = mockApi();
    vi.mocked(api.getStatus).mockResolvedValue({
      errors: ['cluster unavailable'],
    });

    await expect(new AkashService(api).getProviderStatus(provider)).rejects.toThrow(
      'reported errors: cluster unavailable',
    );
  });
});
