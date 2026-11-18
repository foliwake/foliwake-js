import { Args, Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { branchUrls, branchWriteReport } from '../../render/branch-write.js';

export default class BranchUpdate extends CoreCommand {
  static description =
    'Prepare code from a commit (or use --code) and show it in that branch preview; live is unchanged (core ' +
    'branches.update)';

  static examples = [
    '<%= config.bin %> branch update feature/hero --rev feature/hero --latest-selection',
    '<%= config.bin %> branch update feature/hero --code cd_… --expect sel_…',
    '<%= config.bin %> branch update feature/hero --rev <sha> --sequence <ci run id> --json',
  ];

  static args = { branch: Args.string({ description: 'the Git branch whose preview this is' }) };

  static flags = {
    ...CoreCommand.siteFlags,
    rev: Flags.string({
      description: 'the commit to prepare the code from, a branch, tag or full SHA (default HEAD)',
      exclusive: ['code'],
    }),
    code: Flags.string({
      description: 'an already prepared code release (cd_…) instead of preparing one',
      exclusive: ['rev'],
    }),
    ...CoreCommand.expectBranchFlags,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(BranchUpdate);
    const input = await this.resolveInput(flags.input, async () => {
      if (args.branch == null) this.error('Name the branch.', { exit: 2 });
      const { site } = await this.siteInput(flags.site);
      const from = flags.code === undefined ? { rev: flags.rev ?? 'HEAD' } : { code: flags.code };
      return { site, branch: args.branch, from, expect: await this.expectedBranch(site, args.branch, flags) };
    });
    const operation = await this.follow(await this.core.branches.update(input), {
      wait: false,
      waitTimeout: undefined,
    });
    const report = branchWriteReport(operation, (result) => [
      `Branch ${result.branch} previews ${result.codeRelease}: ${branchUrls(result)}`,
      'Live is unchanged.',
    ]);
    if (!this.jsonEnabled()) for (const line of report.lines) this.log(line);
    process.exitCode = report.exitCode;
    return operation;
  }
}
