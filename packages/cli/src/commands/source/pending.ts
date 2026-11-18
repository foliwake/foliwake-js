import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { pendingLines } from '../../render/pending.js';

export default class SourcePending extends CoreCommand {
  static description =
    'Edits waiting in the content sources that the selected snapshots do not have: a read-only check, nothing is ' +
    'fetched into a snapshot or stored (core sources.pending)';

  static examples = ['<%= config.bin %> source pending', '<%= config.bin %> source pending --source lessons --json'];

  static flags = {
    ...CoreCommand.siteFlags,
    source: Flags.string({ description: 'content source id of the site (see `source list`; default: every source)' }),
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourcePending);
    const input = await this.resolveInput(flags.input, async () => ({
      ...(await this.siteInput(flags.site)),
      ...(flags.source === undefined ? {} : { source: flags.source }),
    }));
    const answer = await this.core.sources.pending(input);
    if (!this.jsonEnabled()) for (const line of pendingLines(answer)) this.log(line);
    return answer;
  }
}
