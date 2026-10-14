import { Args, Command } from '@oclif/core';
import { initSDL } from '../../services/sdl-service.js';
export default class SDLCommand extends Command {
  static override description = 'Generate a web SDL template without overwriting files';
  static override args = { file: Args.string({ required: true }) };
  async run() {
    const { args } = await this.parse(SDLCommand);
    await initSDL(args.file);
    this.log(
      `Created ${args.file}; review image, resources, pricing and provider attributes before deploying.`,
    );
  }
}
