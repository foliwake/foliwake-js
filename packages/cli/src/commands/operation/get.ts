import { Args } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { operationRow, traceLines } from '../../render/operation.js';

export default class OperationGet extends CoreCommand {
  static description = 'One long operation: its state, stage, delivery and result (core operations.get)';

  static examples = ['<%= config.bin %> operation get co_… --json'];

  static args = { id: Args.string({ description: 'operation id (co_…)', required: true }) };

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { flags, args } = await this.parse(OperationGet);
    const input = await this.resolveInput(flags.input, async () => ({
      ...(await this.siteInput(flags.site)),
      id: args.id,
    }));
    const operation = await this.core.operations.get(input);
    this.log(operationRow(operation));
    if (operation.delivery)
      this.log(
        `  cache refresh: ` +
          `${operation.delivery.state}${operation.delivery.reason ? ` (${operation.delivery.reason})` : ''}`,
      );
    if (operation.error) this.log(`  ${operation.error.code}: ${operation.error.message}`);
    for (const line of traceLines(operation.trace)) this.log(line);
    return operation;
  }
}
