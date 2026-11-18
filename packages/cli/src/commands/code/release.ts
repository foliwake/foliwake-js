import { Args, Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { longWriteReport } from '../../render/operation-result.js';

export default class CodeRelease extends CoreCommand {
  static description =
    'Make a prepared code release live code; pages stay as they are; refused when live is not the release you ' +
    'expected (core code.release)';

  static examples = [
    '<%= config.bin %> branch list   # code ids per branch',
    '<%= config.bin %> code release cd_… --expect sr_…',
    '<%= config.bin %> code release cd_… --latest-live --rev <sha> --sequence <ci run id> --json',
  ];

  static args = { code: Args.string({ description: 'the prepared code release (cd_…)' }) };

  static flags = {
    ...CoreCommand.siteFlags,
    ...CoreCommand.expectLiveFlags,
    rev: Flags.string({
      description: 'the commit the code was prepared from (full SHA), when it was prepared from several',
    }),
    sequence: Flags.integer({
      min: 1,
      description:
        'deployment ordering, e.g. a CI run id: refused as superseded when live code was released with a higher one',
    }),
    ...CoreCommand.refreshWaitFlag,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(CodeRelease);
    const input = await this.resolveInput(flags.input, async () => {
      if (args.code == null) this.error('Name the prepared code release (cd_…).', { exit: 2 });
      const { site } = await this.siteInput(flags.site);
      return {
        site,
        code: args.code,
        expect: { live: await this.expectedLive(site, flags) },
        ...(flags.rev === undefined ? {} : { sourceRevision: flags.rev }),
        ...(flags.sequence === undefined ? {} : { sequence: flags.sequence }),
      };
    });
    const operation = await this.follow(await this.core.code.release(input), {
      wait: true,
      waitTimeout: flags['wait-timeout'],
    });
    const report = longWriteReport(operation, `Released ${input.code} as live code`);
    if (!this.jsonEnabled()) for (const line of report.lines) this.log(line);
    process.exitCode = report.exitCode;
    return operation;
  }
}
