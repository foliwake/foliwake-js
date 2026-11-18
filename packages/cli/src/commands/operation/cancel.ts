import { Args } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { operationRow } from '../../render/operation.js';

export default class OperationCancel extends CoreCommand {
  static description =
    'Ask a long operation to stop: a queued one stops at once, a running one when it can (core operations.cancel)';

  static examples = ['<%= config.bin %> operation cancel co_…'];

  static args = { id: Args.string({ description: 'operation id (co_…)', required: true }) };

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { flags, args } = await this.parse(OperationCancel);
    const input = await this.resolveInput(flags.input, async () => ({
      ...(await this.siteInput(flags.site)),
      id: args.id,
    }));
    const operation = await this.core.operations.cancel(input);
    this.log(operationRow(operation));
    if (!operation.cancelRequested) this.log('  It cannot stop at this step; it ends on its own.');
    return operation;
  }
}
