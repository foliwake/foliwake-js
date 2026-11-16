// create-foliwake: what a run is asked to do, its defaults and the name rules.
import path from 'node:path';

import { SITE_ID } from '@foliwake/site-check/formats/constants';

export const TEMPLATES = ['minimal', 'examples'] as const;
export type TemplateName = (typeof TEMPLATES)[number];

export const DEFAULT_FOLDER = 'foliwake-site';
export const DEFAULT_TEMPLATE: TemplateName = 'minimal';

/** What to do with a folder that already has files: remove them (.git kept), or add next to them. */
export type ExistingFiles = 'clear' | 'keep';

/** The command line, as given: undefined means "not given" (asked in a terminal, else the default). */
export interface CreateRequest {
  folder?: string | undefined;
  template?: TemplateName | undefined;
  /** The site id on a Foliwake server; "" means none. */
  site?: string | undefined;
  git?: boolean | undefined;
  /** Add Storybook for the blocks (starters/storybook/); asked in a terminal, else no. */
  storybook?: boolean | undefined;
  /** Install the npm packages (only Storybook has any); asked in a terminal after Storybook, else no. */
  install?: boolean | undefined;
  /** Add React support: a React block and the vendored React (starters/react/); asked in a terminal, else no. */
  react?: boolean | undefined;
  existing?: ExistingFiles | undefined;
  interactive?: boolean | undefined;
}

/** Every answer a run needs, after flags, prompts and defaults. */
export interface CreateAnswers {
  folder: string;
  template: TemplateName;
  siteId: string | null;
  git: boolean;
  storybook: boolean;
  install: boolean;
  react: boolean;
  existing: ExistingFiles | null;
}
/** Refused input; nothing was written. */
export class CreateUsageError extends Error {}

/** A prompt was cancelled (Ctrl+C or Escape); nothing was written. */
export class CreateCancelled extends Error {
  constructor() {
    super('Operation cancelled. Nothing was created.');
  }
}

/** Why a site id is not valid, or null. */
export function siteIdProblem(value: string): string | null {
  return SITE_ID.test(value)
    ? null
    : `"${value}" is not a site id: 1–40 lowercase letters, digits and "-", starting with a letter or digit.`;
}

export function templateProblem(value: string): string | null {
  return (TEMPLATES as readonly string[]).includes(value)
    ? null
    : `Unknown template "${value}": use ${TEMPLATES.join(' or ')}.`;
}

export function folderProblem(value: string): string | null {
  if (value.trim() === '') return 'Give a folder name.';
  if (value.includes('\0')) return 'A folder name cannot contain a NUL character.';
  return null;
}

/** A lowercase slug of a folder name, for the package name and the local site id. */
function slug(name: string, max: number): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/** The id of the site in the local configuration: the given site id, else one made from the folder name. */
export function localSiteId(siteId: string | null, target: string): string {
  if (siteId) return siteId;
  const made = slug(path.basename(target), 40);
  return made === '' ? 'site' : made;
}

/** The package.json name for the project (npm rules: lowercase, URL-safe). */
export function packageName(target: string): string {
  const made = slug(path.basename(target), 214);
  return made === '' ? DEFAULT_FOLDER : made;
}
