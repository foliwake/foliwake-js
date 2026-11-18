import { Args } from '@oclif/core';

import { COMMAND } from '../../settings.js';
import { CoreCommand } from '../../core-command.js';
import { branchWriteReport } from '../../render/branch-write.js';

export default class BranchDelete extends CoreCommand {
  static description =
    'Stop serving a branch preview (its hosts answer 404); its code and selection history stay (core branches.remove)';

  static examples = [
    '<%= config.bin %> branch delete feature/hero --expect sel_…',
    '<%= config.bin %> branch delete feature/hero --latest-selection',
    '<%= config.bin %> branch delete feature/hero --sequence <ci run id> --json',
  ];

  static args = { branch: Args.string({ description: 'the Git branch whose preview stops' }) };

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.expectBranchFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(BranchDelete);
    const input = await this.resolveInput(flags.input, async () => {
      if (args.branch == null) this.error('Name the branch.', { exit: 2 });
      const { site } = await this.siteInput(flags.site);
      return { site, branch: args.branch, expect: await this.expectedBranch(site, args.branch, flags) };
    });
    const operation = await this.follow(await this.core.branches.remove(input), {
      wait: false,
      waitTimeout: undefined,
    });
    const report = branchWriteReport(operation, (result) => [
      `Branch ${result.branch} is no longer previewed: its ` +
        `hosts${result.releasedHost ? ` (and ${result.releasedHost})` : ''} now answer 404.`,
      `Its code ${result.codeRelease ?? ''} and selection history stay in storage (immutable). \`${COMMAND} branch ` +
        `update ${result.branch}\` revives it.`,
    ]);
    if (!this.jsonEnabled()) for (const line of report.lines) this.log(line);
    process.exitCode = report.exitCode;
    return operation;
  }
}
