import { createChainNodeSDK, createProviderSDK } from '@akashnetwork/chain-sdk';
import { sandboxNetwork, type AkashNetwork } from '../config/networks.js';

export interface ProviderStatus {
  network: string;
  provider: string;
  status: 'online';
}

interface ProviderRecord {
  owner: string;
  hostUri: string;
}

interface ProviderResponse {
  errors: string[];
}

export interface AkashApi {
  getProvider(owner: string, grpcEndpoint: string): Promise<ProviderRecord | undefined>;
  getStatus(grpcEndpoint: string): Promise<ProviderResponse>;
}

export class AkashServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AkashServiceError';
  }
}

export const akashSdkApi: AkashApi = {
  async getProvider(owner, grpcEndpoint) {
    const sdk = createChainNodeSDK({
      query: { baseUrl: grpcEndpoint, transportOptions: { defaultTimeoutMs: 15_000 } },
    });
    try {
      const response = await sdk.akash.provider.v1beta4.getProvider({ owner });
      return response.provider;
    } finally {
      await sdk[Symbol.asyncDispose]();
    }
  },

  async getStatus(grpcEndpoint) {
    const sdk = createProviderSDK({
      baseUrl: grpcEndpoint,
      transportOptions: { defaultTimeoutMs: 15_000 },
    });
    try {
      return await sdk.akash.provider.v1.getStatus();
    } finally {
      await sdk[Symbol.asyncDispose]();
    }
  },
};

function providerGrpcEndpoint(hostUri: string): string {
  let url: URL;
  try {
    url = new URL(hostUri);
  } catch (error) {
    throw new AkashServiceError('Provider has an invalid gateway URL.', { cause: error });
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new AkashServiceError('Provider has an invalid gateway URL.');
  }

  url.port = '8444';
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.origin;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AkashService {
  constructor(
    private readonly api: AkashApi = akashSdkApi,
    private readonly network: AkashNetwork = sandboxNetwork,
  ) {}

  async getProviderStatus(provider: string): Promise<ProviderStatus> {
    if (!/^akash1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(provider)) {
      throw new AkashServiceError('A valid Akash provider address is required.');
    }

    let record: ProviderRecord | undefined;
    try {
      record = await this.api.getProvider(provider, this.network.grpcEndpoint);
    } catch (error) {
      throw new AkashServiceError(`Could not query ${this.network.name}: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    if (!record || record.owner !== provider || !record.hostUri) {
      throw new AkashServiceError(`Provider ${provider} was not found on ${this.network.name}.`);
    }

    const endpoint = providerGrpcEndpoint(record.hostUri);
    let response: ProviderResponse;
    try {
      response = await this.api.getStatus(endpoint);
    } catch (error) {
      throw new AkashServiceError(`Provider ${provider} is unavailable: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    if (response.errors.length > 0) {
      throw new AkashServiceError(
        `Provider ${provider} reported errors: ${response.errors.join('; ')}`,
      );
    }

    return {
      network: this.network.name,
      provider,
      status: 'online',
    };
  }
}
