import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { syncLines } from '../../render/sync.js';

export default class SourceSync extends CoreCommand {
  static description =
    'Read content sources into private snapshots and select them; preview and live are unchanged (core sources.sync)';

  static examples = [
    '<%= config.bin %> source sync',
    '<%= config.bin %> source sync --source content --json',
    '<%= config.bin %> source sync --source lessons --full',
    '<%= config.bin %> source sync --code cd_…   # before `migration prepare cd_…`',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    source: Flags.string({
      description: 'content source id of the site (see `source list`; default: every enabled source)',
    }),
    full: Flags.boolean({
      description:
        'read every item of the source again (no incremental sync: unchanged items are not kept from the selected ' +
        'snapshot)',
    }),
    code: Flags.string({
      description: 'the prepared code of a migration: read and check the sources against it instead of live code',
    }),
    verbose: Flags.boolean({
      description: "also print codes, snapshots, attempts and the engine's technical text (for support)",
    }),
    ...CoreCommand.timingsFlag,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourceSync);
    const input = await this.resolveInput(flags.input, async () => ({
      ...(await this.siteInput(flags.site)),
      target: flags.source === undefined ? { all: true as const } : { source: flags.source },
      allowWorkingFolder: true,
      ...(flags.full ? { full: true } : {}),
      ...(flags.code === undefined ? {} : { validationCode: flags.code }),
    }));
    return this.timed('sync', flags.timings, async () => {
      const accepted = await this.core.sources.sync(input);
      // Ctrl-C asks the sync to stop; it ends with what it has, nothing selected.
      const cancel = () => void this.core.operations.cancel({ site: accepted.site, id: accepted.id }).catch(() => {});
      process.once('SIGINT', cancel);
      try {
        const operation = await this.follow(accepted, { wait: false, waitTimeout: undefined });
        if (!this.jsonEnabled())
          for (const line of syncLines(operation, flags.code, { verbose: flags.verbose })) this.log(line);
        if (operation.state !== 'succeeded') process.exitCode = 1;
        return operation;
      } finally {
        process.removeListener('SIGINT', cancel);
      }
    });
  }
}
