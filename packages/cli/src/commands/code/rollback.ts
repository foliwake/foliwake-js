import { Args } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { longWriteReport } from '../../render/operation-result.js';

export default class CodeRollback extends CoreCommand {
  static description =
    'Make earlier live code live again; pages stay as they are; refused when live is not the release you expected ' +
    '(core code.rollback)';

  static examples = [
    '<%= config.bin %> site status --json   # earlier code ids are listed under history',
    '<%= config.bin %> code rollback cd_… --expect sr_…',
    '<%= config.bin %> code rollback cd_… --latest-live',
  ];

  static args = { to: Args.string({ description: 'the code release to go back to (cd_…)' }) };

  static flags = {
    ...CoreCommand.siteFlags,
    ...CoreCommand.expectLiveFlags,
    ...CoreCommand.refreshWaitFlag,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(CodeRollback);
    const input = await this.resolveInput(flags.input, async () => {
      if (args.to == null) this.error('Name the code release to go back to (cd_…).', { exit: 2 });
      const { site } = await this.siteInput(flags.site);
      return { site, to: args.to, expect: { live: await this.expectedLive(site, flags) } };
    });
    const operation = await this.follow(await this.core.code.rollback(input), {
      wait: true,
      waitTimeout: flags['wait-timeout'],
    });
    const report = longWriteReport(operation, `Live code rolled back to ${input.to}`);
    if (!this.jsonEnabled()) for (const line of report.lines) this.log(line);
    process.exitCode = report.exitCode;
    return operation;
  }
}
