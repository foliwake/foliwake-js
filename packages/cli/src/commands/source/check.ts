import { Flags } from '@oclif/core';

import type { ProbeAnswer } from '../../core-types.js';
import { CoreCommand } from '../../core-command.js';
import { probeLines } from '../../render/probe.js';

export default class SourceCheck extends CoreCommand {
  static description =
    'Checks content sources without changing anything: settings, credentials, the connection and, ' +
    'with --listing, the files and the page addresses they would get (core sources.probe)';

  static examples = [
    '<%= config.bin %> source check --site my-site',
    '<%= config.bin %> source check --site my-site --source lessons --listing',
    `<%= config.bin %> source check --site my-site --input '{"site":"my-site","candidate":{…}}'`,
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    source: Flags.string({ description: 'one source of the site (default: every enabled source)' }),
    listing: Flags.boolean({
      description: 'also list the files and their page addresses (slower: reads the whole source)',
    }),
    max: Flags.integer({ min: 1, max: 5000, description: 'at most this many files in the listing (default 500)' }),
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourceCheck);
    const site = (await this.siteInput(flags.site)).site;
    const listing = flags.listing ? { listing: flags.max === undefined ? {} : { max: flags.max } } : {};
    if (flags.input !== undefined) return this.probeInput(flags.input, site);
    const ids = flags.source === undefined ? await this.enabledSources(site) : [flags.source];
    const answers: ProbeAnswer[] = [];
    for (const source of ids) answers.push(await this.probeOne({ site, source, ...listing }));
    if (answers.some((answer) => answer.connection?.ok === false || Object.keys(answer.fields).length))
      process.exitCode = 1;
    return answers;
  }

  private async probeInput(raw: string, site: string): Promise<ProbeAnswer> {
    const answer = await this.probeOne(await this.resolveInput(raw, () => ({ site })));
    if (answer.connection?.ok === false || Object.keys(answer.fields).length) process.exitCode = 1;
    return answer;
  }

  private async probeOne(input: Parameters<typeof this.core.sources.probe>[0]): Promise<ProbeAnswer> {
    const answer = await this.core.sources.probe(input);
    if (!this.jsonEnabled()) for (const line of [...probeLines(answer), '']) this.log(line);
    return answer;
  }

  private async enabledSources(site: string): Promise<string[]> {
    const { sources } = await this.core.sources.list({ site });
    return sources.filter((source) => source.enabled && source.mode === 'snapshot').map((source) => source.id);
  }
}
