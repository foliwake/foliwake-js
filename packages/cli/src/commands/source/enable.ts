import { CoreCommand } from '../../core-command.js';
import { sourceEnabledLines } from '../../render/source-enabled.js';
import { switchFlags, switchInput } from '../../source-switch.js';

export default class SourceEnable extends CoreCommand {
  static description =
    'Sync a disabled content source again; its next sync continues from its selected snapshot (core sources.enable)';

  static examples = [
    '<%= config.bin %> source enable --source lessons',
    '<%= config.bin %> source enable --site a --source lessons --expect 12 --json',
  ];

  static flags = switchFlags;

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourceEnable);
    const input = await this.resolveInput(flags.input, async () => {
      if (flags.source == null) this.error('Name the source: --source <id> (see `source list`).', { exit: 2 });
      return switchInput(flags, await this.siteInput(flags.site));
    });
    const answer = await this.core.sources.enable(input);
    for (const line of sourceEnabledLines(answer)) this.log(line);
    return answer;
  }
}
