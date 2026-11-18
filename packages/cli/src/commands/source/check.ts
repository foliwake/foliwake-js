import { readFile } from 'node:fs/promises';

import { Errors, Flags } from '@oclif/core';

import type { ProbeAnswer } from '../../core-types.js';
import { CoreCommand } from '../../core-command.js';
import { probeLines } from '../../render/probe.js';
import { type EntryFlags, entryOf } from '../../source-entry.js';
import { entryFlags } from '../../source-flags.js';

async function readRules(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Errors.CLIError(`--mappings: ${file} is not a readable JSON file of rules.`, { exit: 2 });
  }
}

export default class SourceCheck extends CoreCommand {
  static description =
    'Checks content sources without changing anything: settings, credentials, the connection and, ' +
    'with --listing, the files and the page addresses they would get; a saved source (--source) or a new one ' +
    'described with the flags of `source add` (--id …) (core sources.probe)';

  static examples = [
    '<%= config.bin %> source check --site my-site',
    '<%= config.bin %> source check --site my-site --source lessons --listing',
    '<%= config.bin %> source check --site news --plugin drupal --id news --owns /articles ' +
      '--base-url https://cms.example.org --language en',
    `<%= config.bin %> source check --site my-site --input '{"site":"my-site","candidate":{…}}'`,
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    source: Flags.string({ description: 'one source of the site (default: every enabled source)' }),
    listing: Flags.boolean({
      description: 'also list the files and their page addresses (slower: reads the whole source)',
    }),
    max: Flags.integer({ min: 1, max: 5000, description: 'at most this many files in the listing (default 500)' }),
    ...entryFlags({ required: false }),
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourceCheck);
    const site = (await this.siteInput(flags.site)).site;
    const listing = flags.listing ? { listing: flags.max === undefined ? {} : { max: flags.max } } : {};
    if (flags.input !== undefined) return this.probeInput(flags.input, site);
    if (flags.id !== undefined) return this.probeCandidate(flags as EntryFlags & typeof flags, site, listing);
    const ids = flags.source === undefined ? await this.enabledSources(site) : [flags.source];
    const answers: ProbeAnswer[] = [];
    for (const source of ids) answers.push(await this.probeOne({ site, source, ...listing }));
    if (answers.some((answer) => answer.connection?.ok === false || Object.keys(answer.fields).length))
      process.exitCode = 1;
    return answers;
  }

  /** A source that is not saved, described by the same flags as `source add`; nothing is saved. */
  private async probeCandidate(
    flags: EntryFlags & { source?: string; mappings?: string },
    site: string,
    listing: object,
  ): Promise<ProbeAnswer> {
    if (flags.source !== undefined)
      this.error('Give --source (a saved source) or --id (a new one), not both.', { exit: 2 });
    const rules = flags.mappings === undefined ? undefined : await readRules(flags.mappings);
    const built = entryOf(flags, rules);
    if (!built.ok) throw new Errors.CLIError(built.problem, { exit: 2 });
    const answer = await this.probeOne({ site, candidate: built.value as never, ...listing });
    if (answer.connection?.ok === false || Object.keys(answer.fields).length) process.exitCode = 1;
    return answer;
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
