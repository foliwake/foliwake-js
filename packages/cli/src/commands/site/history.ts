import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';

export default class SiteHistory extends CoreCommand {
  static description = "Who changed a stored site's settings, when, and which settings (core sites.history)";

  static examples = [
    '<%= config.bin %> site history --site my-site',
    '<%= config.bin %> site history --site my-site --limit 50 --json',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    limit: Flags.integer({ min: 1, max: 100, description: 'how many changes, newest first (default 20)' }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SiteHistory);
    const { site } = await this.siteInput(flags.site);
    const answer = await this.core.sites.history({
      site,
      ...(flags.limit === undefined ? {} : { limit: flags.limit }),
    });
    for (const each of answer.revisions)
      this.log(
        `${String(each.revision).padStart(4)}  ${each.at}  ${each.action.padEnd(6)}  ${each.actor}  ` +
          `${each.changed.join(', ') || '-'}`,
      );
    return answer;
  }
}
