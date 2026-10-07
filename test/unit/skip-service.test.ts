import { describe, expect, it, vi } from 'vitest';
import {
  SkipService,
  normalizeEvmPrivateKey,
  type BridgeRequest,
  type CosmosSignerFactory,
  type EvmSignerFactory,
  type SkipApi,
} from '../../src/services/skip-service.js';

const sourceToken = {
  chainId: '8453',
  decimals: 6,
  denom: '0x1234567890123456789012345678901234567890',
  isCw20: false,
  isEvm: true,
  isSvm: false,
  name: 'Base USDC',
  originChainId: '8453',
  originDenom: '0x1234567890123456789012345678901234567890',
  recommendedSymbol: 'USDC',
  symbol: 'USDC',
  tokenContract: '0x1234567890123456789012345678901234567890',
  trace: '',
};

const destinationAkt = {
  chainId: 'akashnet-2',
  decimals: 6,
  denom: 'uakt',
  isCw20: false,
  isEvm: false,
  isSvm: false,
  name: 'Akash Network',
  originChainId: 'akashnet-2',
  originDenom: 'uakt',
  recommendedSymbol: 'AKT',
  symbol: 'AKT',
  trace: '',
};

const chains = [
  chain('base', '8453', 'Base', 'evm', '', false),
  chain('noble', 'noble-1', 'Noble', 'cosmos', 'noble', false),
  chain('osmosis', 'osmosis-1', 'Osmosis', 'cosmos', 'osmo', false),
  chain('akash', 'akashnet-2', 'Akash', 'cosmos', 'akash', false),
];

const request: BridgeRequest = {
  amount: '1.25',
  fromChain: 'base',
  fromToken: 'USDC',
  slippage: 1,
  toAddress: 'akash1destination',
  toChain: 'akash',
  toToken: 'AKT',
};

function chain(
  chainName: string,
  chainId: string,
  prettyName: string,
  chainType: 'cosmos' | 'evm',
  bech32Prefix: string,
  isTestnet: boolean,
) {
  return {
    bech32Prefix,
    chainId,
    chainName,
    chainType,
    cosmosModuleSupport: {},
    feeAssets: [],
    ibcCapabilities: {},
    isTestnet,
    pfmEnabled: false,
    prettyName,
    supportsMemo: true,
  };
}

function skipRoute(doesSwap = true) {
  return {
    amountIn: '1250000',
    amountOut: '1720000',
    chainIds: ['8453', 'noble-1', 'osmosis-1', 'akashnet-2'],
    destAssetChainId: 'akashnet-2',
    destAssetDenom: 'uakt',
    doesSwap,
    estimatedAmountOut: '1720000',
    estimatedFees: [],
    estimatedRouteDurationSeconds: 900,
    operations: [
      {
        amountIn: '1250000',
        amountOut: '1230000',
        cctpTransfer: {},
        txIndex: 0,
      },
      { amountIn: '1230000', amountOut: '1720000', swap: {}, txIndex: 1 },
      { amountIn: '1720000', amountOut: '1720000', transfer: {}, txIndex: 1 },
    ],
    requiredChainAddresses: ['8453', 'noble-1', 'osmosis-1', 'akashnet-2'],
    sourceAssetChainId: '8453',
    sourceAssetDenom: sourceToken.denom,
    swapPriceImpactPercent: '0.3',
    txsRequired: 2,
    usdAmountIn: '1.25',
    usdAmountOut: '1.21',
  };
}

function mockApi(): SkipApi {
  return {
    configure: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
    getAssets: vi.fn().mockResolvedValue({
      '8453': [sourceToken],
      'akashnet-2': [destinationAkt],
    }),
    getChains: vi.fn().mockResolvedValue(chains),
    getRoute: vi.fn().mockResolvedValue(skipRoute()),
    getStatus: vi.fn().mockResolvedValue({
      transfers: [
        {
          state: 'STATE_PENDING',
          transferSequence: [
            {
              cctpTransfer: {
                txs: {
                  sendTx: { explorerLink: 'https://base.example/tx/0xbridge' },
                },
              },
            },
          ],
        },
      ],
    }),
  } as unknown as SkipApi;
}

describe('SkipService', () => {
  it('normalizes private keys copied from EVM wallets', () => {
    const key = 'ab'.repeat(32);

    expect(normalizeEvmPrivateKey(key)).toBe(`0x${key}`);
    expect(normalizeEvmPrivateKey(`  0x${key}  `)).toBe(`0x${key}`);
    expect(() => normalizeEvmPrivateKey('not-a-private-key')).toThrow(
      'exactly 64 hexadecimal characters',
    );
  });

  it('quotes an anonymous mainnet USDC to AKT route using aliases', async () => {
    const api = mockApi();
    const result = await new SkipService(api, 'mainnet').getBridgeQuote(request);

    expect(api.configure).toHaveBeenCalledWith(undefined);
    expect(api.getRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        allowMultiTx: true,
        allowSwaps: true,
        amountIn: '1250000',
        destAssetChainId: 'akashnet-2',
        destAssetDenom: 'uakt',
        sourceAssetChainId: '8453',
        sourceAssetDenom: sourceToken.denom,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        actions: ['cctp-transfer', 'swap', 'transfer'],
        fromAmount: '1.25',
        minimumReceived: '1.7028',
        toAmount: '1.72',
        transactionsRequired: 2,
      }),
    );
  });

  it('rejects mainnet chains while the testnet environment is selected', async () => {
    const api = mockApi();

    await expect(new SkipService(api, 'testnet').getBridgeQuote(request)).rejects.toThrow(
      'Chain base is not supported in the Skip Go testnet registry.',
    );
  });

  it('rejects a swap when swaps are disabled outside mainnet', async () => {
    const api = mockApi();
    const testChains = [
      chain('source-testnet', '100', 'Source Testnet', 'evm', '', true),
      chain('destination-testnet', 'destination-1', 'Destination', 'cosmos', 'dest', true),
    ];
    vi.mocked(api.getChains).mockResolvedValue(testChains as never);
    vi.mocked(api.getAssets).mockResolvedValue({
      '100': [{ ...sourceToken, chainId: '100', originChainId: '100' }],
      'destination-1': [
        {
          ...destinationAkt,
          chainId: 'destination-1',
          originChainId: 'destination-1',
        },
      ],
    } as never);
    vi.mocked(api.getRoute).mockResolvedValue({
      ...skipRoute(),
      destAssetChainId: 'destination-1',
      requiredChainAddresses: ['100', 'destination-1'],
      sourceAssetChainId: '100',
    } as never);

    await expect(
      new SkipService(api, 'testnet').getBridgeQuote({
        ...request,
        fromChain: '100',
        toChain: 'destination-1',
      }),
    ).rejects.toThrow('Pass --allow-swap');
  });

  it('builds EVM and Cosmos addresses and executes every route transaction', async () => {
    const api = mockApi();
    vi.mocked(api.execute).mockImplementation(async (options) => {
      await options.onTransactionBroadcast?.({ chainId: '8453', txHash: '0xsource' });
      await options.onTransactionBroadcast?.({ chainId: 'noble-1', txHash: 'cosmos-hash' });
    });
    const signerFactory: EvmSignerFactory = vi.fn().mockResolvedValue({
      address: '0x1111111111111111111111111111111111111111',
      chainId: '8453',
      signer: {},
    });
    const cosmosSignerFactory: CosmosSignerFactory = vi.fn(async (prefix) => ({
      getAccounts: async () => [{ address: `${prefix}1derived` }],
    }));

    const result = await new SkipService(api, 'mainnet', signerFactory).submitBridge(
      request,
      'https://rpc.example',
      '0xprivate',
      cosmosSignerFactory,
    );

    expect(cosmosSignerFactory).toHaveBeenCalledWith('noble');
    expect(cosmosSignerFactory).toHaveBeenCalledWith('osmo');
    expect(api.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userAddresses: [
          { address: '0x1111111111111111111111111111111111111111', chainId: '8453' },
          { address: 'noble1derived', chainId: 'noble-1' },
          { address: 'osmo1derived', chainId: 'osmosis-1' },
          { address: 'akash1destination', chainId: 'akashnet-2' },
        ],
      }),
    );
    expect(result.transactionHashes).toEqual([
      { chainId: '8453', hash: '0xsource' },
      { chainId: 'noble-1', hash: 'cosmos-hash' },
    ]);
  });

  it('checks that the RPC network matches the requested source chain', async () => {
    const api = mockApi();
    const signerFactory: EvmSignerFactory = vi.fn().mockResolvedValue({
      address: '0x1111111111111111111111111111111111111111',
      chainId: '1',
      signer: {},
    });

    await expect(
      new SkipService(api, 'mainnet', signerFactory).submitBridge(
        request,
        'https://rpc.example',
        '0xprivate',
        vi.fn(),
      ),
    ).rejects.toThrow('RPC is connected to EVM chain 1');
    expect(api.execute).not.toHaveBeenCalled();
  });

  it('retrieves transaction status and explorer links', async () => {
    const api = mockApi();

    await expect(new SkipService(api).getBridgeStatus('0xbridge', '8453')).resolves.toEqual({
      explorerLinks: ['https://base.example/tx/0xbridge'],
      status: 'STATE_PENDING',
    });
    expect(api.getStatus).toHaveBeenCalledWith({ chainId: '8453', txHash: '0xbridge' });
  });
});
