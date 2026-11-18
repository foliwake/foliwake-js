import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { pageChangesLines } from '../../render/page-changes.js';

export default class PageChanges extends CoreCommand {
  static description = 'Compare working pages (text and images) with the live site (core content.changes)';

  static examples = ['<%= config.bin %> page changes', '<%= config.bin %> page changes --changed --json'];

  static flags = {
    ...CoreCommand.siteFlags,
    ...CoreCommand.contentFlag,
    changed: Flags.boolean({ description: 'list only pages that differ from the live site' }),
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(PageChanges);
    const input = await this.resolveInput(flags.input, async () => ({
      ...(await this.siteInput(flags.site)),
      input: { kind: 'workspace' as const },
      changedOnly: flags.changed,
    }));
    const changes = await this.core.content.changes(input);
    this.noteProvisional(changes.provisional);
    for (const line of pageChangesLines(changes)) this.log(line);
    return changes;
  }
}
