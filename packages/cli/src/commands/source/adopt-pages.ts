import { Args } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';

export default class SourceAdoptPages extends CoreCommand {
  static description =
    'Let a source take over published pages that no source owns yet (published by an earlier configuration: one ' +
    'folder), at paths it owns; preview and live are unchanged (core sources.adoptPages)';

  static examples = [
    '<%= config.bin %> source adopt-pages git',
    '<%= config.bin %> source adopt-pages git --site a --json',
  ];

  static args = {
    source: Args.string({ description: 'the content source that takes the pages over (see `source list`)' }),
  };

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(SourceAdoptPages);
    const input = await this.resolveInput(flags.input, async () => {
      if (args.source == null) this.error('Name the source that takes the pages over.', { exit: 2 });
      return { ...(await this.siteInput(flags.site)), source: args.source };
    });
    const result = await this.core.sources.adoptPages(input);
    this.log(
      result.accepted.length
        ? `Source ${result.source} now owns ${result.accepted.length} published page id(s): ` +
            `${result.accepted.join(', ')}. Recorded; preview and live are unchanged.`
        : `No published page without an owner lies at a path source ${result.source} owns; nothing was accepted.`,
    );
    for (const skipped of result.skipped) this.log(`  not accepted: ${skipped.page_id} (${skipped.reason})`);
    return result;
  }
}
