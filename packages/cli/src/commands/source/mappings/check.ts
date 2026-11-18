import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Flags } from '@oclif/core';

import { formatDiagnostic } from '../../../lib/diagnostics.js';
import { coverageSummary } from '../../../lib/summaries.js';
import { CoreCommand } from '../../../core-command.js';

export default class SourceMappingsCheck extends CoreCommand {
  static description = [
    "Dry run of a source's path mappings over the documents it already has (the selected snapshot, or a working " +
      "folder's files):",
    "each document's page path now and with the rules, unmatched files and problems; reads no upstream and changes " +
      'nothing (core sources.mappingsCheck)',
  ].join(' ');

  static examples = [
    '<%= config.bin %> source mappings check',
    '<%= config.bin %> source mappings check --site my-site --source docs-en',
    '<%= config.bin %> source mappings check --source docs-en --file mappings.json',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    source: Flags.string({ description: 'only this source (default: every source with path mappings)' }),
    file: Flags.string({
      description: 'check the rules in this JSON file (a list of rules) instead of the configured ones; needs --source',
    }),
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourceMappingsCheck);
    const input = await this.resolveInput(flags.input, async () => {
      let mappings: unknown;
      if (flags.file !== undefined) {
        try {
          mappings = JSON.parse(await readFile(path.resolve(process.cwd(), flags.file), 'utf8'));
        } catch (error) {
          this.error(`--file ${flags.file}: ${error instanceof Error ? error.message : String(error)}`, { exit: 2 });
        }
      }
      const site = await this.siteInput(flags.site);
      return {
        ...site,
        ...(flags.source === undefined ? {} : { source: flags.source }),
        ...(mappings === undefined ? {} : { mappings }),
      };
    });
    const result = await this.core.sources.mappingsCheck(input);
    if (result.sources.length === 0) this.log('No source of this site has path mappings.');
    for (const source of result.sources) {
      this.log(`Source ${source.source} (${source.mode}${source.snapshot ? `, snapshot ${source.snapshot}` : ''}):`);
      for (const problem of source.ruleProblems) this.log(`  rule problem: ${problem}`);
      if (source.mode === 'snapshot' && source.snapshot === null)
        this.log('  no snapshot is selected yet: nothing to check (sync the source first).');
      for (const row of source.documents) {
        const change = row.before === row.after ? (row.after ?? '-') : `${row.before ?? '-'} → ${row.after ?? '-'}`;
        this.log(
          `  ${row.document}: ${row.outcome === 'page' ? change : row.outcome}${row.rule ? ` (${row.rule})` : ''}`,
        );
      }
      if (source.rules.length > 0) this.log(`  documents per rule: ${coverageSummary(source.rules)}`);
      for (const diagnostic of source.diagnostics)
        this.log(`  ${formatDiagnostic(diagnostic).replaceAll('\n', '\n  ')}`);
      this.log(`  ${source.documents.length} document(s): ${source.errors} error(s), ${source.warnings} warning(s).`);
    }
    if (result.sources.some((source) => source.errors > 0)) process.exitCode = 1;
    return result;
  }
}
