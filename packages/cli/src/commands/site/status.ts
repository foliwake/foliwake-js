import { CoreCommand } from '../../core-command.js';
import { siteStatusLines } from '../../render/site-status.js';

export default class SiteStatus extends CoreCommand {
  static description = 'Live, preview, code and pending work at a glance (core sites.status)';

  static examples = ['<%= config.bin %> site status', '<%= config.bin %> site status --site my-site --json'];

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SiteStatus);
    const input = await this.resolveInput(flags.input, () => this.siteInput(flags.site));
    const status = await this.core.sites.status(input);
    for (const line of siteStatusLines(status)) this.log(line);
    return status;
  }
}
