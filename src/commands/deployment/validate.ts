import { Args, Command } from '@oclif/core';
import { loadSDL } from '../../services/sdl-service.js';
export default class SDLCommand extends Command {
  static override description = 'Validate SDL and calculate its manifest hash';
  static override args = { file: Args.string({ required: true }) };
  async run() {
    const { args } = await this.parse(SDLCommand);
    const result = await loadSDL(args.file);
    this.log(
      `SDL valid. Groups: ${result.groupSpecs.length}. Manifest hash: ${Buffer.from(result.hash).toString('hex')}`,
    );
  }
}
