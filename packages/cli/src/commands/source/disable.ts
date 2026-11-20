import { CoreCommand } from '../../core-command.js';
import { sourceEnabledLines } from '../../render/source-enabled.js';
import { switchFlags, switchInput } from '../../source-switch.js';

export default class SourceDisable extends CoreCommand {
  static description =
    'Stop syncing a content source: preview keeps its last accepted snapshot, its live pages and owned paths ' +
    'are kept (core sources.disable)';

  static examples = [
    '<%= config.bin %> source disable --source lessons',
    '<%= config.bin %> source disable --site a --source lessons --expect 12 --json',
  ];

  static flags = switchFlags;

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourceDisable);
    const input = await this.resolveInput(flags.input, async () => {
      if (flags.source == null) this.error('Name the source: --source <id> (see `source list`).', { exit: 2 });
      return switchInput(flags, await this.siteInput(flags.site));
    });
    const answer = await this.core.sources.disable(input);
    for (const line of sourceEnabledLines(answer)) this.log(line);
    return answer;
  }
}
