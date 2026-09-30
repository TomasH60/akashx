import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const provider = 'akash1wxr49evm8hddnx9ujsdtd86gk46s7ejnccqfmy';
const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  getStatus: vi.fn(),
  disposeChain: vi.fn(),
  disposeProvider: vi.fn(),
}));

vi.mock('@akashnetwork/chain-sdk', () => ({
  createChainNodeSDK: () => ({
    akash: { provider: { v1beta4: { getProvider: mocks.getProvider } } },
    [Symbol.asyncDispose]: mocks.disposeChain,
  }),
  createProviderSDK: () => ({
    akash: { provider: { v1: { getStatus: mocks.getStatus } } },
    [Symbol.asyncDispose]: mocks.disposeProvider,
  }),
}));

import ProviderStatus from '../../src/commands/provider/status.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete process.env.AKASHX_PROVIDER;
});

describe('provider status command', () => {
  it('displays status from mocked Akash SDK responses', async () => {
    mocks.getProvider.mockResolvedValue({
      provider: { owner: provider, hostUri: 'https://provider.example.com:8443' },
    });
    mocks.getStatus.mockResolvedValue({ errors: [], publicHostnames: [] });
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message) => {
      output.push(String(message));
    });

    await ProviderStatus.run([provider], root);

    expect(output).toEqual(['Network: sandbox-2', `Provider: ${provider}`, 'Status: online']);
    expect(mocks.getProvider).toHaveBeenCalledWith({ owner: provider });
    expect(mocks.getStatus).toHaveBeenCalledOnce();
    expect(mocks.disposeChain).toHaveBeenCalledOnce();
    expect(mocks.disposeProvider).toHaveBeenCalledOnce();
  });

  it('accepts a provider from the environment', async () => {
    process.env.AKASHX_PROVIDER = provider;
    mocks.getProvider.mockResolvedValue({
      provider: { owner: provider, hostUri: 'https://provider.example.com:8443' },
    });
    mocks.getStatus.mockResolvedValue({ errors: [], publicHostnames: [] });
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message) => {
      output.push(String(message));
    });

    await ProviderStatus.run([], root);

    expect(output).toContain(`Provider: ${provider}`);
  });
});
