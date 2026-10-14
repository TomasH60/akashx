import { Command } from '@oclif/core';
import { readConfig, json } from '../../services/config-service.js';
export default class ConfigShow extends Command {
  static override description =
    'Show effective tenant configuration (environment overrides saved values)';
  async run() {
    this.log(json(await readConfig()));
  }
}
