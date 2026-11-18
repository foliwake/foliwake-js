// What `site create`, `connect --create` and `create --create-site` decide before a site is created
// (connect.ts): the organisation, never silently (`--org`; the only one the account may create sites in, said;
// several: asked in a terminal, else refused with the list), and the repository the server will fetch from
// (`--repository`; by default the folder's Git `origin` as an https:// address; `none`: no repository yet).
import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { CoreCaller } from './core-types.js';

/** A refusal with a text for people; nothing was sent or changed. */
export class ConnectRefused extends Error {}

/** An organisation the account may create sites in. */
export interface CreatableOrg {
  id: string;
  name: string;
}

/** Asks which organisation (in a terminal); null when no answer was given. */
export type OrgPicker = (orgs: CreatableOrg[]) => Promise<string | null>;

/** `--repository none`: create the site without a repository. */
export const NO_REPOSITORY = 'none';

const run = promisify(execFile);

/** The installation may create sites in every organisation; others where they are admin over all sites. */
export async function creatableOrgs(core: CoreCaller): Promise<CreatableOrg[]> {
  const grant = await core.whoami();
  const orgs = await core.org.list();
  const admin = (org: (typeof orgs)[number]) => org.membership?.role === 'admin' && org.membership.sites === null;
  return orgs.filter((org) => grant.installation || admin(org)).map(({ id, name }) => ({ id, name }));
}

function severalOrgs(orgs: CreatableOrg[]): ConnectRefused {
  const lines = orgs.map((org) => `  ${org.id}${org.name && org.name !== org.id ? ` (${org.name})` : ''}`);
  const head = `You may create sites in ${orgs.length} organisations; say which one with --org <id>:`;
  return new ConnectRefused([head, ...lines].join('\n'));
}

/** The organisation of a new site: `org`, the only one (said), the one picked, or a refusal. */
export async function chooseOrg(
  core: CoreCaller,
  request: { org?: string | undefined; pickOrg?: OrgPicker | undefined },
  say: (text: string) => void,
): Promise<string> {
  if (request.org) return request.org;
  const orgs = await creatableOrgs(core);
  if (orgs.length === 0) {
    throw new ConnectRefused('This account may not create sites: that needs the admin role in an organisation.');
  }
  if (orgs.length === 1) {
    say(`Organisation: ${orgs[0].id} (the only one where you may create sites).`);
    return orgs[0].id;
  }
  if (!request.pickOrg) throw severalOrgs(orgs);
  const chosen = await request.pickOrg(orgs);
  if (!chosen) throw new ConnectRefused('No organisation was chosen; nothing was done.');
  return chosen;
}

const SCP = /^(?:[^@/\s]+@)?([a-z0-9-]+(?:\.[a-z0-9-]+)+):(?!\/\/)([^\s:]+)$/i;

function httpsOf(host: string, repoPath: string): string | null {
  const clean = repoPath.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '');
  if (!clean || clean.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return `https://${host.toLowerCase()}/${clean}`;
}

/**
 * A Git remote as the https:// address a server fetches (it fetches over HTTPS only): scp form and ssh://
 * become https://, credentials, ports and `.git` are dropped. Null for a local path or another scheme.
 */
export function httpsRepository(remote: string): string | null {
  const text = remote.trim();
  const scp = SCP.exec(text);
  if (scp) return httpsOf(scp[1], scp[2]);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!['https:', 'http:', 'ssh:', 'git+ssh:', 'git:'].includes(url.protocol) || !url.hostname.includes('.')) {
    return null;
  }
  return httpsOf(url.hostname, decodeURIComponent(url.pathname));
}

/** The `origin` of the folder's own Git repository, or null (no repository, not its root, no origin). */
async function folderOrigin(cwd: string): Promise<string | null> {
  const git = async (args: string[]) => (await run('git', args, { cwd, env: { ...process.env } })).stdout.trim();
  try {
    if ((await realpath(await git(['rev-parse', '--show-toplevel']))) !== (await realpath(cwd))) return null;
    return await git(['remote', 'get-url', 'origin']);
  } catch {
    return null;
  }
}

/** The repository of a new site: `--repository` (`none`: null), else the folder's `origin` (said), else null. */
export async function chooseRepository(
  request: { cwd: string; repository?: string | null | undefined },
  say: (text: string) => void,
): Promise<string | null> {
  if (request.repository === NO_REPOSITORY) return null;
  if (request.repository !== undefined) return request.repository;
  const origin = await folderOrigin(request.cwd);
  const https = origin === null ? null : httpsRepository(origin);
  if (https === null) {
    const why = origin === null ? "this folder's Git repository has no origin" : 'its origin is no repository address';
    say(`Repository: none (${why}); add it later, or pass --repository <https address>.`);
    return null;
  }
  say(`Repository: ${https} (this folder's origin; --repository names another, --repository none sets none).`);
  return https;
}
