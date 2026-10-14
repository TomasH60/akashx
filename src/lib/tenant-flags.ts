import { Flags } from '@oclif/core';
import type { TenantConfig } from '../services/config-service.js';
import { walletFileFlag } from './wallet-flags.js';
export const tenantFlags = {
  network: Flags.string({ description: 'Expected chain ID, e.g. sandbox-2' }),
  rpc: Flags.string({ description: 'Chain RPC URL' }),
  grpc: Flags.string({ description: 'Chain gRPC URL' }),
  'wallet-file': walletFileFlag,
};
export const leaseFlags = {
  provider: Flags.string({ description: 'Provider address' }),
  gseq: Flags.integer({ min: 1, description: 'Resource group sequence' }),
  oseq: Flags.integer({ min: 1, description: 'Order sequence' }),
};
export const yesFlag = Flags.boolean({
  description: 'Authorize the displayed operation and transaction fees',
  required: true,
});
export function configOverrides(flags: {
  network?: string | undefined;
  rpc?: string | undefined;
  grpc?: string | undefined;
  'wallet-file'?: string | undefined;
}): Partial<TenantConfig> {
  const result: Partial<TenantConfig> = {};
  if (flags.network) result.network = flags.network;
  if (flags.rpc) result.rpc = flags.rpc;
  if (flags.grpc) result.grpc = flags.grpc;
  if (flags['wallet-file']) result.walletFile = flags['wallet-file'];
  return result;
}
