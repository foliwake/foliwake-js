// The flags that describe a new source entry (source-entry.ts): `source add` saves it, `source check` checks it.
import { Flags } from '@oclif/core';

import { DEFAULT_DRIVE_KEY, DRIVE_PLUGIN } from './source-entry.js';

/** `required`: --id and --owns must be given (`source add`); `source check` takes them only for a candidate. */
export function entryFlags({ required }: { required: boolean }) {
  return {
    plugin: Flags.string({ description: 'the connector', default: DRIVE_PLUGIN }),
    id: Flags.string({ description: 'the new source id (lower case, digits, "-")', required }),
    'display-name': Flags.string({ description: 'the name the dashboard shows' }),
    owns: Flags.string({
      description: 'a path the source owns, such as /lessons or "=/" (repeatable)',
      multiple: true,
      required,
    }),
    mappings: Flags.string({
      description: 'a JSON file with path mapping rules (default: each file names its address)',
    }),
    folder: Flags.string({ description: 'Google Drive or Google Docs: the folder link or ID' }),
    subfolder: Flags.string({ description: 'Google Drive or Git: the folder inside that holds the pages' }),
    identity: Flags.string({
      description: 'Google Drive: file-id (default; renames keep the page) or front-matter',
      options: ['file-id', 'front-matter'],
    }),
    key: Flags.string({
      description: `Google Drive or Docs: the credential name of the service-account key (default ${DEFAULT_DRIVE_KEY})`,
    }),
    repository: Flags.string({ description: 'Git: the https address of the repository' }),
    branch: Flags.string({ description: 'Git: the branch (default main)' }),
    token: Flags.string({ description: 'Git: the credential name of a read-only token (private repository)' }),
    'base-url': Flags.string({ description: 'Drupal: the site address' }),
    language: Flags.string({ description: 'Drupal: a language code, the default first (repeatable)', multiple: true }),
    'basic-user': Flags.string({ description: 'Drupal: the credential name of a read-only user name (HTTP Basic)' }),
    'basic-password': Flags.string({ description: 'Drupal: the credential name of its password' }),
    'list-title': Flags.string({
      description: 'Drupal: the heading of the article list page, per --language in the same order (repeatable)',
      multiple: true,
    }),
    page: Flags.string({
      description: 'Google Docs: <document link or ID>=<page path>, one published page (repeatable)',
      multiple: true,
    }),
    'allow-private-host': Flags.string({
      description:
        "a host on a private network the source may reach, e.g. a Drupal inside the server's network " +
        "(operator.allowPrivateHosts; the installation's owner only; repeatable)",
      multiple: true,
    }),
  };
}
