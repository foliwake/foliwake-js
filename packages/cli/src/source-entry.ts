// The source entry `foliwake source add` builds from its flags: the same entry a person would write
// into the site's `sources`, checked afterwards by core (sources.probe, sources.add). A Drive folder
// link is reduced to its folder ID here and never requested.
export const DRIVE_PLUGIN = 'google-drive-markdown';
export const DEFAULT_DRIVE_KEY = 'FOLIWAKE_GOOGLE_SA_KEY';

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const FILE_LINK = /\/(?:file|document|spreadsheets|presentation)\/d\//;

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };

function driveUrlId(url: URL): string | null {
  const folder = /\/drive\/(?:u\/\d+\/)?folders\/([^/?#]+)/.exec(url.pathname)?.[1];
  return folder ?? url.searchParams.get('id');
}

/** The folder ID of a Drive folder link (`/drive/folders/<id>`, `/drive/u/N/folders/<id>`, `?id=`) or a bare ID. */
export function driveFolderId(text: string): Parsed<string> {
  const trimmed = text.trim();
  if (DRIVE_ID.test(trimmed)) return { ok: true, value: trimmed };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, problem: 'Paste the folder link from the browser, or its ID.' };
  }
  if (FILE_LINK.test(url.pathname))
    return { ok: false, problem: 'This is a file link; paste the folder that holds the pages.' };
  const id = driveUrlId(url);
  if (id === null || !DRIVE_ID.test(id))
    return { ok: false, problem: 'This link names no Drive folder; paste the folder link or its ID.' };
  return { ok: true, value: id };
}

export interface EntryFlags {
  plugin: string;
  id: string;
  'display-name'?: string | undefined;
  owns?: string[] | undefined;
  folder?: string | undefined;
  subfolder?: string | undefined;
  identity?: string | undefined;
  key?: string | undefined;
  repository?: string | undefined;
  branch?: string | undefined;
  token?: string | undefined;
  'base-url'?: string | undefined;
  language?: string[] | undefined;
  'basic-user'?: string | undefined;
  'basic-password'?: string | undefined;
}

type Entry = Record<string, unknown>;

function driveEntry(flags: EntryFlags): Parsed<Entry> {
  if (flags.folder === undefined) return { ok: false, problem: '--folder is required: the Drive folder link or ID.' };
  const folder = driveFolderId(flags.folder);
  if (!folder.ok) return folder;
  const settings: Entry = { auth: 'service-account', folderId: folder.value, identity: flags.identity ?? 'file-id' };
  if (flags.subfolder) settings.subfolder = flags.subfolder;
  return { ok: true, value: { settings, credentials: { serviceAccountKey: flags.key ?? DEFAULT_DRIVE_KEY } } };
}

function gitEntry(flags: EntryFlags): Parsed<Entry> {
  if (flags.repository === undefined)
    return { ok: false, problem: '--repository is required: the https address of the repository.' };
  if (/^(?:git@|ssh:|git:)/.test(flags.repository)) {
    return {
      ok: false,
      problem: 'Use the https address; Foliwake reads over HTTPS with a token, no SSH key is needed.',
    };
  }
  const settings: Entry = { repository: flags.repository, branch: flags.branch ?? 'main' };
  if (flags.subfolder) settings.subfolder = flags.subfolder;
  return { ok: true, value: { settings, ...(flags.token ? { credentials: { token: flags.token } } : {}) } };
}

function drupalEntry(flags: EntryFlags): Parsed<Entry> {
  if (flags['base-url'] === undefined)
    return { ok: false, problem: '--base-url is required: the Drupal site address.' };
  const languages = (flags.language ?? []).map((langcode) => ({ langcode }));
  if (languages.length === 0) return { ok: false, problem: 'Name at least one --language, the default one first.' };
  const credentials: Entry = {};
  if (flags['basic-user']) credentials.username = flags['basic-user'];
  if (flags['basic-password']) credentials.password = flags['basic-password'];
  const extra = Object.keys(credentials).length ? { credentials } : {};
  return { ok: true, value: { settings: { baseUrl: flags['base-url'], languages }, ...extra } };
}

const BUILDERS: Record<string, (flags: EntryFlags) => Parsed<Entry>> = {
  [DRIVE_PLUGIN]: driveEntry,
  'git-markdown': gitEntry,
  drupal: drupalEntry,
};

/** The entry of the flags, or the first problem. `mappings`: the rules of `--mappings`, as written. */
export function entryOf(flags: EntryFlags, mappings: unknown): Parsed<Entry> {
  const build = BUILDERS[flags.plugin];
  if (!build) return { ok: false, problem: `--plugin must be one of ${Object.keys(BUILDERS).join(', ')}.` };
  const built = build(flags);
  if (!built.ok) return built;
  const entry: Entry = { id: flags.id, plugin: flags.plugin, owns: flags.owns ?? [], ...built.value };
  if (flags['display-name']) entry.displayName = flags['display-name'];
  if (mappings !== undefined) entry.mappings = mappings;
  return { ok: true, value: entry };
}
