import { Command } from '@oclif/core';
import chalk from 'chalk';
import { bridgeFlags, parseEnvironment, parseSlippage } from '../../lib/bridge-flags.js';
import { SkipService, SkipServiceError } from '../../services/skip-service.js';

export default class BridgeQuote extends Command {
  static override description = 'Quote a Skip Go bridge or cross-chain swap route';

  static override examples = [
    '<%= config.bin %> bridge quote --environment mainnet --amount 5 --from-chain base --from-token USDC --to-chain akash --to-token AKT --to-address akash1...',
  ];

  static override flags = bridgeFlags;

  async run(): Promise<void> {
    const { flags } = await this.parse(BridgeQuote);
    const environment = parseEnvironment(flags.environment);

    try {
      const result = await new SkipService(undefined, environment).getBridgeQuote({
        allowSwap: flags['allow-swap'],
        amount: flags.amount,
        fromChain: flags['from-chain'],
        fromToken: flags['from-token'],
        slippage: parseSlippage(flags.slippage),
        toAddress: flags['to-address'],
        toChain: flags['to-chain'],
        toToken: flags['to-token'],
      });

      this.log(`${chalk.bold('Environment:')} Skip Go ${environment}`);
      this.log(`${chalk.bold('Send:')} ${result.fromAmount} ${result.fromSymbol}`);
      this.log(`${chalk.bold('Receive:')} ${result.toAmount} ${result.toSymbol}`);
      this.log(`${chalk.bold('Minimum received:')} ${result.minimumReceived} ${result.toSymbol}`);
      this.log(`${chalk.bold('Actions:')} ${result.actions.join(' -> ')}`);
      this.log(`${chalk.bold('Price impact:')} ${result.priceImpact}%`);
      this.log(
        `${chalk.bold('Fees:')} ${result.fees.length > 0 ? result.fees.join('; ') : 'none'}`,
      );
      this.log(`${chalk.bold('Estimated duration:')} ${result.estimatedDurationSeconds}s`);
      this.log(`${chalk.bold('Transactions required:')} ${result.transactionsRequired}`);
      this.log(
        `${chalk.bold('Required address chains:')} ${result.requiredChainAddresses.join(', ')}`,
      );
      if (result.warning) this.log(`${chalk.bold('Warning:')} ${chalk.yellow(result.warning)}`);
    } catch (error) {
      if (error instanceof SkipServiceError || error instanceof Error) {
        this.error(error.message);
      }
      throw error;
    }
  }
}
