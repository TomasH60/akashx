import { Args, Command } from '@oclif/core';
import { setConfig, configKeys } from '../../services/config-service.js';
export default class ConfigSet extends Command {
  static override description = 'Save a tenant configuration value';
  static override args = {
    key: Args.string({ required: true, options: [...configKeys] }),
    value: Args.string({ required: true }),
  };
  async run() {
    const { args } = await this.parse(ConfigSet);
    await setConfig(args.key, args.value);
    this.log(`Saved ${args.key}.`);
  }
}
