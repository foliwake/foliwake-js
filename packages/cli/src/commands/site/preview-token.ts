import { CoreCommand } from '../../core-command.js';

export default class SitePreviewToken extends CoreCommand {
  static description =
    "A site's preview token, for an app that reads preview (HTTP Basic, user preview); site admins only, and " +
    'every answer is written to the audit log without the value (core sites.previewToken)';

  static examples = [
    '<%= config.bin %> site preview-token --site my-site',
    '<%= config.bin %> site preview-token --site my-site --json',
  ];

  static flags = { ...CoreCommand.siteFlags };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SitePreviewToken);
    const answer = await this.core.sites.previewToken(await this.siteInput(flags.site));
    this.log(`Preview token of ${answer.site} (HTTP Basic user "${answer.username}"; the server logged this request):`);
    this.log(answer.token);
    this.log("Put it in your app's server environment as FOLIWAKE_PREVIEW_TOKEN; never commit it.");
    return answer;
  }
}
