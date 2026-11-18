import { readFile } from 'node:fs/promises';

import { confirm, isCancel } from '@clack/prompts';
import { Errors, Flags } from '@oclif/core';

import type { AddAnswer } from '../../core-types.js';
import type { ProbeAnswer } from '../../core-types.js';
import { CoreCommand } from '../../core-command.js';
import { addLines } from '../../render/add.js';
import { probeLines } from '../../render/probe.js';
import { DEFAULT_DRIVE_KEY, DRIVE_PLUGIN, type EntryFlags, entryOf } from '../../source-entry.js';

const usable = (probe: ProbeAnswer): boolean => Object.keys(probe.fields).length === 0;

async function readRules(file: string | undefined): Promise<unknown> {
  if (file === undefined) return undefined;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Errors.CLIError(`--mappings: ${file} is not a readable JSON file of rules.`, { exit: 2 });
  }
}

export default class SourceAdd extends CoreCommand {
  static description =
    'Adds a content source to a site: checks it first (settings, credentials, connection, files and their ' +
    'addresses), then saves it after a confirmation; nothing is fetched (core sources.probe, sources.add)';

  static examples = [
    '<%= config.bin %> source add --site my-site --id lessons --owns /lessons ' +
      '--folder https://drive.google.com/drive/folders/1AbC…',
    '<%= config.bin %> source add --site docs --plugin git-markdown --id docs --owns /docs ' +
      '--repository https://github.com/acme/docs',
    '<%= config.bin %> source add --site news --plugin drupal --id news --owns /articles ' +
      '--base-url https://cms.example.org --language en',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    plugin: Flags.string({ description: 'the connector', default: DRIVE_PLUGIN }),
    id: Flags.string({ description: 'the new source id (lower case, digits, "-")', required: true }),
    'display-name': Flags.string({ description: 'the name the dashboard shows' }),
    owns: Flags.string({
      description: 'a path the source owns, such as /lessons or "=/" (repeatable)',
      multiple: true,
      required: true,
    }),
    mappings: Flags.string({
      description: 'a JSON file with path mapping rules (default: each file names its address)',
    }),
    folder: Flags.string({ description: 'Google Drive: the folder link or ID' }),
    subfolder: Flags.string({ description: 'Google Drive or Git: the folder inside that holds the pages' }),
    identity: Flags.string({
      description: 'Google Drive: file-id (default; renames keep the page) or front-matter',
      options: ['file-id', 'front-matter'],
    }),
    key: Flags.string({
      description: `Google Drive: the credential name of the service-account key (default ${DEFAULT_DRIVE_KEY})`,
    }),
    repository: Flags.string({ description: 'Git: the https address of the repository' }),
    branch: Flags.string({ description: 'Git: the branch (default main)' }),
    token: Flags.string({ description: 'Git: the credential name of a read-only token (private repository)' }),
    'base-url': Flags.string({ description: 'Drupal: the site address' }),
    language: Flags.string({ description: 'Drupal: a language code, the default first (repeatable)', multiple: true }),
    'basic-user': Flags.string({ description: 'Drupal: the credential name of a read-only user name (HTTP Basic)' }),
    'basic-password': Flags.string({ description: 'Drupal: the credential name of its password' }),
    'check-only': Flags.boolean({ description: 'check and print, save nothing' }),
    yes: Flags.boolean({ description: 'save without asking (scripts)' }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourceAdd);
    const site = (await this.siteInput(flags.site)).site;
    const built = entryOf(flags as EntryFlags, await readRules(flags.mappings));
    if (!built.ok) throw new Errors.CLIError(built.problem, { exit: 2 });
    const probe = await this.core.sources.probe({ site, candidate: built.value as never, listing: {} });
    this.print(probeLines(probe));
    if (!usable(probe) || flags['check-only']) return this.finishCheck(probe);
    if (!(await this.confirmed(flags.yes, probe))) return { probe, saved: null };
    const saved = await this.core.sources.add({
      site,
      entry: built.value as never,
      expect: { revision: probe.revision ?? '' },
    });
    this.print(addLines(saved));
    return { probe, saved };
  }

  private print(lines: string[]): void {
    if (!this.jsonEnabled()) for (const line of lines) this.log(line);
  }

  private finishCheck(probe: ProbeAnswer): { probe: ProbeAnswer; saved: AddAnswer | null } {
    if (!usable(probe) || probe.connection?.ok === false) process.exitCode = 1;
    return { probe, saved: null };
  }

  /** --yes, or a person who says yes in a terminal; a failed connection is said before the question. */
  private async confirmed(yes: boolean, probe: ProbeAnswer): Promise<boolean> {
    if (yes) return true;
    if (!process.stdin.isTTY || this.jsonEnabled()) {
      throw new Errors.CLIError('Add --yes to save without a terminal (or --check-only to save nothing).', { exit: 2 });
    }
    const warning = probe.connection?.ok === false ? ' The connection check failed;' : '';
    const answer = await confirm({ message: `${warning} Save source ${probe.source} to site ${probe.site}?`.trim() });
    return !isCancel(answer) && answer === true;
  }
}
