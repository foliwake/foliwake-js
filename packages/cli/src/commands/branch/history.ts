import { Args } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { branchHistoryLines } from '../../render/branches.js';

export default class BranchHistory extends CoreCommand {
  static description = 'Selection history of one branch (core branches.history)';

  static examples = [
    '<%= config.bin %> branch history main',
    '<%= config.bin %> branch history feature/hero --site a --json',
  ];

  static args = { branch: Args.string({ description: 'the branch' }) };

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(BranchHistory);
    const input = await this.resolveInput(flags.input, async () => {
      if (args.branch == null) this.error('Name the branch (or pass the full input as --input JSON).', { exit: 2 });
      return { ...(await this.siteInput(flags.site)), branch: args.branch };
    });
    const history = await this.core.branches.history(input);
    for (const line of branchHistoryLines(history)) this.log(line);
    return history;
  }
}
