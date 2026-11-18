import { Args, Command } from '@oclif/core';

import { ServerAddressError, serverDisplay, serverOrigin, useServer } from '../../remote/servers.js';
import { COMMAND } from '../../settings.js';

export default class ServersUse extends Command {
  static description = 'Make a signed-in server the default of commands that name no server';

  static examples = ['<%= config.bin %> servers use https://foliwake.example'];

  static enableJsonFlag = true;

  static args = { server: Args.string({ description: 'server origin or host', required: true }) };

  async run(): Promise<unknown> {
    const { args } = await this.parse(ServersUse);
    const origin = this.originOf(args.server);
    if (!useServer(origin)) {
      this.error(`This computer is not signed in to ${origin}; sign in first: \`${COMMAND} login ${origin}\`.`, {
        exit: 1,
      });
    }
    this.log(`Commands that name no server now call ${serverDisplay(origin)}.`);
    return { default: origin };
  }

  private originOf(typed: string): string {
    try {
      return serverOrigin(typed);
    } catch (error) {
      if (error instanceof ServerAddressError) this.error(error.message, { exit: 2 });
      throw error;
    }
  }
}
