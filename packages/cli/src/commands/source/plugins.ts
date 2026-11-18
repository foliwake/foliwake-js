import { CoreCommand } from '../../core-command.js';
import { pluginListLines } from '../../render/plugin-list.js';

export default class SourcePlugins extends CoreCommand {
  static description =
    'Registered content-source plugins, their versions and the planned catalog (core sources.plugins)';

  static examples = [
    '<%= config.bin %> source plugins',
    '<%= config.bin %> source plugins --debug   # why a plugin failed, on stderr',
  ];

  async run(): Promise<unknown> {
    const plugins = await this.core.sources.plugins();
    for (const line of pluginListLines(plugins)) this.log(line);
    if (plugins.problems.length) process.exitCode = 1;
    return plugins;
  }
}
