import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { bridgeFlags, parseEnvironment, parseSlippage } from '../../lib/bridge-flags.js';
import { getWalletPassword, getWalletPath, walletFileFlag } from '../../lib/wallet-flags.js';
import { SkipService, SkipServiceError } from '../../services/skip-service.js';
import { WalletService } from '../../services/wallet-service.js';

export default class BridgeSend extends Command {
  static override description = 'Execute a Skip Go bridge or cross-chain swap route';

  static override examples = [
    '<%= config.bin %> bridge send --environment mainnet --amount 5 --from-chain base --from-token USDC --to-chain akash --to-token AKT --to-address akash1... --yes',
  ];

  static override flags = {
    ...bridgeFlags,
    'wallet-file': walletFileFlag,
    yes: Flags.boolean({
      char: 'y',
      description: 'Confirm submission of the approval and bridge transactions',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BridgeSend);
    const environment = parseEnvironment(flags.environment);
    const privateKey = process.env.AKASHX_EVM_PRIVATE_KEY;
    const rpcUrl = process.env.AKASHX_EVM_RPC_URL;

    if (!rpcUrl) this.error('Set AKASHX_EVM_RPC_URL to the source EVM RPC URL.');
    if (!privateKey) this.error('Set AKASHX_EVM_PRIVATE_KEY to the source EVM private key.');

    try {
      const walletService = new WalletService();
      const walletPath = getWalletPath(flags['wallet-file']);
      const walletPassword = getWalletPassword();
      const result = await new SkipService(undefined, environment).submitBridge(
        {
          allowSwap: flags['allow-swap'],
          amount: flags.amount,
          fromChain: flags['from-chain'],
          fromToken: flags['from-token'],
          slippage: parseSlippage(flags.slippage),
          toAddress: flags['to-address'],
          toChain: flags['to-chain'],
          toToken: flags['to-token'],
        },
        rpcUrl,
        privateKey,
        async (prefix) =>
          (await walletService.loadForPrefix(walletPath, walletPassword, prefix)).signer,
        (quote) => {
          this.log(`${chalk.bold('Environment:')} Skip Go ${environment}`);
          this.log(`${chalk.bold('Send:')} ${quote.fromAmount} ${quote.fromSymbol}`);
          this.log(`${chalk.bold('Receive:')} ${quote.toAmount} ${quote.toSymbol}`);
          this.log(`${chalk.bold('Minimum received:')} ${quote.minimumReceived} ${quote.toSymbol}`);
          this.log(`${chalk.bold('Actions:')} ${quote.actions.join(' -> ')}`);
          this.log(`${chalk.bold('Price impact:')} ${quote.priceImpact}%`);
          this.log(
            `${chalk.bold('Fees:')} ${quote.fees.length > 0 ? quote.fees.join('; ') : 'none'}`,
          );
          this.log(`${chalk.bold('Transactions required:')} ${quote.transactionsRequired}`);
        },
        (message) => this.log(message),
      );

      if (result.transactionHashes.length === 0) {
        this.log(chalk.yellow('Skip Go completed without reporting a transaction hash.'));
      } else {
        for (const transaction of result.transactionHashes) {
          this.log(
            `${chalk.bold(`Transaction (${transaction.chainId}):`)} ${chalk.green(transaction.hash)}`,
          );
        }
      }
    } catch (error) {
      if (error instanceof SkipServiceError || error instanceof Error) {
        this.error(error.message);
      }
      throw error;
    }
  }
}
