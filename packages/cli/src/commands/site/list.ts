import { CoreCommand } from '../../core-command.js';

export default class SiteList extends CoreCommand {
  static description = 'Configured sites with hosts, repositories and bindings (core sites.list)';

  static examples = ['<%= config.bin %> site list --config foliwake.config.json', '<%= config.bin %> site list --json'];

  static flags = { ...CoreCommand.configFlag };

  async run(): Promise<unknown> {
    const answer = await this.core.sites.list();
    answer.sites.forEach((site, i) => {
      if (i > 0) this.log('');
      this.log(site.id);
      for (const key of [
        'org',
        'liveHosts',
        'previewBaseHost',
        'liveUrl',
        'previewUrl',
        'branchUrls',
        'addresses',
        'binding',
        'repository',
      ] as const) {
        const value = site[key];
        this.log(`  ${key.padEnd(16)}${Array.isArray(value) ? value.join(', ') : value}`);
      }
    });
    return answer;
  }
}
