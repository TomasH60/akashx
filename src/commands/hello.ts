import { Args, Command } from '@oclif/core';

export default class Hello extends Command {
  static override description = 'Say hello';

  static override args = {
    name: Args.string({ description: 'Name to greet', default: 'world' }),
  };

  static override examples = ['<%= config.bin %> hello', '<%= config.bin %> hello Tomas'];

  async run(): Promise<void> {
    const { args } = await this.parse(Hello);

    this.log(`Hello, ${args.name}!`);
  }
}
