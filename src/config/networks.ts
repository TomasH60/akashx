export interface AkashNetwork {
  readonly name: string;
  readonly grpcEndpoint: string;
}

export const sandboxNetwork: AkashNetwork = {
  name: 'sandbox-2',
  grpcEndpoint: 'https://grpc.sandbox-2.aksh.pw:443',
};
