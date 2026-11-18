import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { operationRow } from '../../render/operation.js';

export default class OperationList extends CoreCommand {
  static description = 'The latest long operations of a site, newest first (core operations.list)';

  static examples = ['<%= config.bin %> operation list', '<%= config.bin %> operation list --limit 5 --json'];

  static flags = {
    ...CoreCommand.siteFlags,
    limit: Flags.integer({ min: 1, max: 200, description: 'how many (default 50)' }),
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(OperationList);
    const input = await this.resolveInput(flags.input, async () => ({
      ...(await this.siteInput(flags.site)),
      ...(flags.limit === undefined ? {} : { limit: flags.limit }),
    }));
    const list = await this.core.operations.list(input);
    if (list.operations.length === 0) this.log('No operations yet.');
    for (const operation of list.operations) this.log(operationRow(operation));
    return list;
  }
}
