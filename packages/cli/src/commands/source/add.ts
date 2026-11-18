import { readFile } from 'node:fs/promises';

import { confirm, isCancel } from '@clack/prompts';
import { Errors, Flags } from '@oclif/core';

import type { AddAnswer } from '../../core-types.js';
import type { ProbeAnswer } from '../../core-types.js';
import { CoreCommand } from '../../core-command.js';
import { addLines } from '../../render/add.js';
import { probeLines } from '../../render/probe.js';
import { type EntryFlags, entryOf } from '../../source-entry.js';
import { entryFlags } from '../../source-flags.js';

const usable = (probe: ProbeAnswer): boolean => Object.keys(probe.fields).length === 0;

const WHOLE_SITE = /"([a-z0-9-]+)" owns the whole site/;

/** The source that owns the whole site, when that is why the candidate was refused. */
export const wholeSiteOwner = (probe: ProbeAnswer): string | null =>
  Object.values(probe.fields)
    .map((message) => WHOLE_SITE.exec(message)?.[1])
    .find((owner): owner is string => Boolean(owner)) ?? null;

/**
 * When another source owns the whole site (`/`, as the project's `content` source of a new site), how to make
 * room: that source keeps the home page and the prefixes its pages use; the new source then owns its own.
 */
export function ownershipHints(owner: string, index: number, site: string): string[] {
  return [
    '',
    `Source "${owner}" owns the whole site (/), so no other source can own pages beside it. Narrow it to the home`,
    'page and the prefixes its pages use (`source check --source <id> --listing` shows them), then add this',
    'source again, e.g.:',
    `  foliwake site set --site ${site} sources.${index}.owns '["=/", "/blocks"]'`,
  ];
}

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
      '--base-url https://cms.example.org --language en --list-title "News"',
    '<%= config.bin %> source add --site docs --plugin google-docs --id guides --owns /guides ' +
      '--page https://docs.google.com/document/d/1AbC…/edit=/guides/intro',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    ...entryFlags({ required: true }),
    'check-only': Flags.boolean({ description: 'check and print, save nothing' }),
    force: Flags.boolean({ description: 'save even when the connection check fails' }),
    yes: Flags.boolean({ description: 'save without asking (scripts)' }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SourceAdd);
    const site = (await this.siteInput(flags.site)).site;
    const built = entryOf(flags as EntryFlags, await readRules(flags.mappings));
    if (!built.ok) throw new Errors.CLIError(built.problem, { exit: 2 });
    const probe = await this.core.sources.probe({ site, candidate: built.value as never, listing: {} });
    this.print(probeLines(probe));
    if (!usable(probe)) await this.explainOwnership(probe, site);
    if (!usable(probe) || flags['check-only']) return this.finishCheck(probe);
    if (probe.connection?.ok === false && !flags.force) return this.refuseFailed(probe);
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

  private async explainOwnership(probe: ProbeAnswer, site: string): Promise<void> {
    const owner = wholeSiteOwner(probe);
    if (owner === null) return;
    const { sources } = await this.core.sources.list({ site });
    this.print(ownershipHints(owner, Math.max(0, sources.findIndex((source) => source.id === owner)), site));
  }

  /** A source whose connection check failed is not saved unless --force. */
  private refuseFailed(probe: ProbeAnswer): { probe: ProbeAnswer; saved: null } {
    this.logToStderr('The connection check failed; nothing was saved. Fix it and run again, or pass --force.');
    process.exitCode = 1;
    return { probe, saved: null };
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
