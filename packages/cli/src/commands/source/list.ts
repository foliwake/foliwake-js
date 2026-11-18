import { CoreCommand } from '../../core-command.js';
import { sourceListLines } from '../../render/source-list.js';

export default class SourceList extends CoreCommand {
  static description = "The site's content sources: plugin, owned paths and selected snapshot (core sources.list)";

  static examples = ['<%= config.bin %> source list', '<%= config.bin %> source list --site a --json'];

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourceList);
    const input = await this.resolveInput(flags.input, () => this.siteInput(flags.site));
    const sources = await this.core.sources.list(input);
    for (const line of sourceListLines(sources)) this.log(line);
    return sources;
  }
}
