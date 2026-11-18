import { Flags } from '@oclif/core';

import { COMMAND } from '../../settings.js';
import { parseExpectedVersion } from '../../lib/rules.js';
import { CoreCommand } from '../../core-command.js';
import { exitCodeOf, operationResultLines, succeeded } from '../../render/operation-result.js';

export default class MigrationCommit extends CoreCommand {
  static description =
    'Release the reviewed preview of new code: code and pages go live as one site release (core migration.commit)';

  static examples = [
    '<%= config.bin %> migration commit --expect sr_…@cd_…',
    '<%= config.bin %> migration commit --expect sr_…@cd_… --sequence <ci run id> --json',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    expect: Flags.string({ description: 'the reviewed preview and its code, sr_…@cd_… (`site status` prints them)' }),
    sequence: Flags.integer({
      description: 'deployment ordering, e.g. a CI run id; an older one than live code is refused',
      min: 1,
    }),
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(MigrationCommit);
    const input = await this.resolveInput(flags.input, async () => {
      const expected = flags.expect === undefined ? null : parseExpectedVersion(flags.expect);
      if (expected?.code === undefined)
        this.error('--expect must be the reviewed preview and its code, sr_…@cd_….', { exit: 2 });
      return {
        ...(await this.siteInput(flags.site)),
        expect: { preview: expected.preview, code: expected.code },
        ...(flags.sequence === undefined ? {} : { sequence: flags.sequence }),
      };
    });
    const result = await this.core.migration.commit(input);
    for (const line of operationResultLines(
      result,
      `Released ${result.codeRelease ?? 'the reviewed code'} with every page`,
    ))
      this.log(line);
    if (succeeded(result) && result.previousSiteRelease && result.siteRelease) {
      this.log(
        `To go back: \`${COMMAND} release rollback ${result.previousSiteRelease} --expect ${result.siteRelease}\`.`,
      );
    }
    process.exitCode = exitCodeOf(result);
    return result;
  }
}
