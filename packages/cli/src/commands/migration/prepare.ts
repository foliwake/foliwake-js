import { Args, Flags } from '@oclif/core';

import { COMMAND } from '../../settings.js';
import { CoreCommand } from '../../core-command.js';
import { operationResultLines, succeeded } from '../../render/operation-result.js';

const pageList = (value: string | undefined): string[] | undefined =>
  value === undefined
    ? undefined
    : value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

export default class MigrationPrepare extends CoreCommand {
  static description =
    'Rebuild every live page against prepared code as the preview; live is unchanged (core migration.prepare)';

  static examples = [
    '<%= config.bin %> migration prepare cd_…',
    '<%= config.bin %> migration prepare cd_… --rev <sha> --json',
    '<%= config.bin %> migration prepare cd_… --remove old-page --add new-page',
  ];

  static args = { code: Args.string({ description: 'the prepared code release (cd_…)' }) };

  static flags = {
    ...CoreCommand.siteFlags,
    ...CoreCommand.contentFlag,
    rev: Flags.string({ description: 'the commit the code was prepared from, recorded with the preview' }),
    add: Flags.string({ description: 'pages that are not live and join the site with it (comma-separated IDs)' }),
    remove: Flags.string({ description: 'live pages that leave the site with it (comma-separated IDs)' }),
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(MigrationPrepare);
    const input = await this.resolveInput(flags.input, async () => {
      if (args.code == null)
        this.error('Name the prepared code release (or pass the full input as --input JSON).', { exit: 2 });
      const add = pageList(flags.add);
      const remove = pageList(flags.remove);
      return {
        ...(await this.siteInput(flags.site)),
        code: args.code,
        ...(flags.rev ? { sourceRevision: flags.rev } : {}),
        ...(add ? { add } : {}),
        ...(remove ? { remove } : {}),
      };
    });
    const result = await this.core.migration.prepare(input);
    for (const line of operationResultLines(result, 'Every page rebuilt in preview')) this.log(line);
    if (succeeded(result) && result.siteRelease && result.codeRelease) {
      this.log(
        `Live is unchanged. Review the preview, then release it with \`${COMMAND} migration commit --expect ` +
          `${result.siteRelease}@${result.codeRelease}\`.`,
      );
    }
    if (!succeeded(result)) process.exitCode = 1;
    return result;
  }
}
