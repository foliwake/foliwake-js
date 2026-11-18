import { Args } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { longWriteReport } from '../../render/operation-result.js';

export default class ReleaseRollback extends CoreCommand {
  static description =
    'Make an earlier site release live again, code and pages as they were, as a new release; refused when live is ' +
    'not the release you expected (core channels.rollback)';

  static examples = [
    '<%= config.bin %> release rollback sr_… --expect sr_…',
    '<%= config.bin %> site status --json   # codeRollout.rollbackTo is one step back',
    '<%= config.bin %> release rollback sr_… --latest-live',
  ];

  static args = { to: Args.string({ description: 'the site release to go back to (sr_…)' }) };

  static flags = {
    ...CoreCommand.siteFlags,
    ...CoreCommand.expectLiveFlags,
    ...CoreCommand.refreshWaitFlag,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(ReleaseRollback);
    const input = await this.resolveInput(flags.input, async () => {
      if (args.to == null) this.error('Name the site release to go back to (sr_…).', { exit: 2 });
      const { site } = await this.siteInput(flags.site);
      return { site, to: args.to, expect: { live: await this.expectedLive(site, flags) } };
    });
    const operation = await this.follow(await this.core.channels.rollback(input), {
      wait: true,
      waitTimeout: flags['wait-timeout'],
    });
    const report = longWriteReport(operation, `Rolled back to ${input.to}`);
    if (!this.jsonEnabled()) for (const line of report.lines) this.log(line);
    process.exitCode = report.exitCode;
    return operation;
  }
}
