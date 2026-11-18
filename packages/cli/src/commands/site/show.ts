import { CoreCommand } from '../../core-command.js';

export default class SiteShow extends CoreCommand {
  static description =
    "A site's stored settings and their revision, on a server that keeps its sites in a database (core sites.get)";

  static examples = ['<%= config.bin %> site show --site my-site', '<%= config.bin %> site show --site my-site --json'];

  static flags = { ...CoreCommand.siteFlags };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SiteShow);
    const answer = await this.core.sites.get(await this.siteInput(flags.site));
    this.log(
      `${answer.site} (organisation ${answer.org}) · revision ${answer.revision} · changed ` +
        `${answer.updatedAt}${answer.serverFields === 'hidden' ? " · the installation's fields are not shown" : ''}`,
    );
    this.log(JSON.stringify(answer.entry, null, 2));
    // `codeRelease` absent = auto.
    const mode = answer.entry.codeRelease === 'manual' ? 'manual' : 'auto';
    this.log(
      `New frontend code: ` +
        `${mode === 'auto' ? 'released automatically when its checks pass' : 'waits in preview for Release'} ` +
        `(codeRelease: ${mode}${answer.entry.codeRelease === undefined ? ', the default' : ''}).`,
    );
    return answer;
  }
}
