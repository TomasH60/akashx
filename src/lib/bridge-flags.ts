import { Flags } from '@oclif/core';

export type BridgeEnvironment = 'mainnet' | 'testnet';

export const environmentFlag = Flags.string({
  default: 'testnet',
  description: 'Skip Go chain environment',
  options: ['testnet', 'mainnet'],
});

export const bridgeFlags = {
  'allow-swap': Flags.boolean({
    description: 'Permit routes containing swaps outside mainnet',
  }),
  amount: Flags.string({
    description: 'Human-readable source amount, such as 5.25',
    required: true,
  }),
  environment: environmentFlag,
  'from-chain': Flags.string({ description: 'Source chain ID or name', required: true }),
  'from-token': Flags.string({
    description: 'Source token symbol, address, or denomination',
    required: true,
  }),
  slippage: Flags.string({ default: '1', description: 'Maximum slippage percentage' }),
  'to-address': Flags.string({ description: 'Destination Cosmos address', required: true }),
  'to-chain': Flags.string({ description: 'Destination chain ID or name', required: true }),
  'to-token': Flags.string({
    description: 'Destination token symbol, address, or denomination',
    required: true,
  }),
};

export function parseEnvironment(value: string): BridgeEnvironment {
  if (value !== 'testnet' && value !== 'mainnet') {
    throw new Error('Environment must be testnet or mainnet.');
  }
  return value;
}

export function parseSlippage(value: string): number {
  const slippage = Number(value);
  if (!Number.isFinite(slippage) || slippage < 0.01 || slippage > 99.99) {
    throw new Error('Slippage must be between 0.01 and 99.99.');
  }
  return slippage;
}
