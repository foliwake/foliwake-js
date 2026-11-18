// `foliwake site create <id>` and `foliwake site link <id>`, and `foliwake
// create`'s «Connect to a Foliwake server?». Create: the
// project's site on the signed-in server with `sites.create`, the project's
// commit sent as a Git bundle so release 1 has its code and pages, and what the
// user sets up next. Link: the folder to an existing site. Either works with any
// server the CLI is signed in to; it never prints a token, a key or a server path.
import { codeTokenName } from './lib/rules.js';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { setting } from './settings.js';

import type { CoreCaller, Grant, Operation, SiteCreateResult } from './core-types.js';
import { COMMAND } from './settings.js';
import {
  CLOUD,
  CLOUD_NOTE,
  CLOUD_TITLE,
  cloudOrigin,
  issuerOf,
  nameOrigin,
  readProfiles,
  serverDisplay,
  serverName,
  serverOrigin,
  signInMoved,
} from './remote/servers.js';

const C = COMMAND;
const run = promisify(execFile);
/** At most 512 KiB of bundle (the API's body is 1 MB, base64); the same limit as core's. */
export const MAX_BUNDLE_BYTES = 512 * 1024;
/** core's rule on the server, checked before anything is sent. */
const CREATED_SITE_ID = /^(?=.{1,12}$)[a-z](?:-?[a-z0-9])*$/;
const CONNECT_WAIT_MS = 10 * 60 * 1000;

export interface ConnectRequest {
  cwd: string;
  /** Origin or host; default: FOLIWAKE_SERVER, then the only signed-in server (several: `pick`, else refused). */
  server?: string | undefined;
  /** In a terminal: asks which server when this computer is signed in to several. */
  pick?: ServerPicker | undefined;
  /** Replace a link of the folder to another server or site without asking (`--relink`). */
  relink?: boolean | undefined;
  /** In a terminal: asks whether to replace a link of the folder to another server or site. */
  confirmRelink?: RelinkConfirm | undefined;
  site: string;
  org?: string | undefined;
  repository?: string | null | undefined;
  /** false: create the site without code; release 1 waits for the first `code prepare`. */
  code: boolean;
  env: NodeJS.ProcessEnv;
}

export interface ConnectIO {
  out(text?: string): void;
  err(text?: string): void;
  /** For tests: the caller of a server (default: the signed-in remote caller). */
  callerFor?: (origin: string) => CoreCaller;
}

export interface ConnectOutcome {
  exit: number;
  server: string | null;
  operation: Operation | null;
  result: SiteCreateResult | null;
}

export class ConnectRefused extends Error {}

async function git(cwd: string, args: string[]): Promise<string> {
  return (
    await run('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 16 << 20 })
  ).stdout.trim();
}

/** The project's commit as a bundle, or why there is none (then the site is created without code). */
/** `codeOnly`: changes in content/ do not count as dirty (pages are pushed as they are). */
export async function projectCommit(
  cwd: string,
  env: NodeJS.ProcessEnv,
  { codeOnly = false }: { codeOnly?: boolean } = {},
): Promise<{ bundle: string; commit: string; dirty: boolean } | { none: string }> {
  let top: string;
  try {
    top = await git(cwd, ['rev-parse', '--show-toplevel']);
  } catch {
    return { none: 'the folder is not a Git repository' };
  }
  if ((await realpath(top)) !== (await realpath(cwd))) return { none: 'the folder is inside another Git repository' };
  let commit: string;
  try {
    commit = await git(cwd, ['rev-parse', '--verify', 'HEAD^{commit}']);
  } catch {
    return { none: 'the repository has no commit yet' };
  }
  const dirty =
    (await git(cwd, [
      'status',
      '--porcelain',
      '--untracked-files=no',
      '--',
      '.',
      ...(codeOnly ? [':(exclude)content'] : []),
    ])) !== '';
  const dir = await mkdtemp(path.join(env.TMPDIR ?? os.tmpdir(), 'foliwake-connect-'));
  try {
    const file = path.join(dir, 'project.bundle');
    await git(cwd, ['bundle', 'create', '--quiet', file, 'HEAD']);
    if ((await stat(file)).size > MAX_BUNDLE_BYTES)
      return { none: `its Git history is larger than ${MAX_BUNDLE_BYTES / 1024} KiB` };
    return { bundle: (await readFile(file)).toString('base64'), commit, dirty };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A server this computer knows: signed in (its account's e-mail when known), or signed out of. */
export interface KnownServer {
  origin: string;
  signedIn: boolean;
  /** The signed-in account's e-mail address, when the server said it. */
  account: string | null;
  /** The server of the last `login` (the default of other commands). */
  lastUsed: boolean;
  /** How it is named in a list instead of its origin ("Foliwake Cloud (cloud)"). */
  title?: string;
}

/**
 * The servers to offer: those signed in to (the last used first, then by origin; a
 * FOLIWAKE_SERVER with FOLIWAKE_TOKEN counts), then those signed out of, then Foliwake Cloud
 * when not signed in to it (`withCloud`). Reads no token.
 */
export async function knownServers(
  env: NodeJS.ProcessEnv,
  { withCloud = false }: { withCloud?: boolean } = {},
): Promise<KnownServer[]> {
  const profiles = readProfiles(env);
  const cloud = cloudOrigin(env);
  const titled = (entry: KnownServer): KnownServer =>
    entry.origin === cloud ? { ...entry, title: `${CLOUD_TITLE} (${CLOUD})` } : entry;
  const signed: KnownServer[] = [];
  const moved: KnownServer[] = [];
  for (const [name, profile] of Object.entries(profiles.servers)) {
    const origin = nameOrigin(name, env);
    if (!origin) continue;
    // Signed in only where its token was issued: a "cloud" sign-in made elsewhere needs a new login.
    if (issuerOf(name, profile) !== origin)
      moved.push(titled({ origin, signedIn: false, account: null, lastUsed: false }));
    else if (!signed.some((known) => known.origin === origin))
      signed.push(
        titled({
          origin,
          signedIn: true,
          account: typeof profile.email === 'string' ? profile.email : null,
          lastUsed: name === profiles.default,
        }),
      );
  }
  const envServer = setting('SERVER', env);
  if (envServer && setting('TOKEN', env)) {
    const origin = nameOrigin(envServer, env);
    if (origin && !signed.some((known) => known.origin === origin))
      signed.push(titled({ origin, signedIn: true, account: null, lastUsed: false }));
  }
  signed.sort((a, b) => Number(b.lastUsed) - Number(a.lastUsed) || a.origin.localeCompare(b.origin));
  const all = [...signed];
  for (const entry of moved) if (!all.some((known) => known.origin === entry.origin)) all.push(entry);
  for (const name of profiles.signedOut) {
    const origin = nameOrigin(name, env);
    if (origin && !all.some((known) => known.origin === origin))
      all.push(titled({ origin, signedIn: false, account: null, lastUsed: false }));
  }
  if (withCloud && !all.some((known) => known.origin === cloud))
    all.push(titled({ origin: cloud, signedIn: false, account: null, lastUsed: false }));
  return all;
}

/** How a server is shown in a list: its name or origin, the account and whether it was used last. */
export function serverLabel(server: KnownServer): string {
  const notes = [server.account, server.lastUsed ? 'last used' : null, server.signedIn ? null : 'signed out'].filter(
    Boolean,
  );
  const name = server.title ? `${server.title}, ${server.origin}` : server.origin;
  return notes.length ? `${name} (${notes.join(', ')})` : name;
}

/** Asks which of these signed-in servers to use (in a terminal); null when no answer was given. */
export type ServerPicker = (servers: KnownServer[]) => Promise<string | null>;

/**
 * Where a connect goes: --server, then FOLIWAKE_SERVER, then the only server this computer is
 * signed in to. Signed in to several: asked with `pick` (a terminal), else refused with the list:
 * never silently the last login.
 */
export async function chooseServer(
  request: Pick<ConnectRequest, 'server' | 'env'>,
  pick?: ServerPicker,
): Promise<string> {
  if (request.server) return serverOrigin(request.server, request.env);
  const typed = setting('SERVER', request.env);
  if (typed) return serverOrigin(typed, request.env);
  const signed = (await knownServers(request.env)).filter((server) => server.signedIn);
  if (signed.length === 0)
    throw new ConnectRefused(
      `Not signed in to a Foliwake server. Sign in first: \`${C} login [<server>]\`, then run this command again.`,
    );
  if (signed.length === 1) return signed[0].origin;
  if (pick) {
    const chosen = await pick(signed);
    if (!chosen) throw new ConnectRefused('No server was chosen; nothing was done.');
    return chosen;
  }
  throw new ConnectRefused(
    [
      `This computer is signed in to ${signed.length} Foliwake servers; say which one with --server <origin> (or ` +
        `set FOLIWAKE_SERVER):`,
      ...signed.map((server) => `  ${serverLabel(server)}`),
    ].join('\n'),
  );
}

/** How commits reach the server: it fetches them, CI names them with a key. */
function codeOnServer(site: string): string[] {
  return [
    "  2. Code on the server: it fetches the commit a deploy names from the site's repository. A private one needs",
    `     a read token: \`foliwake credential set ${codeTokenName(site)} --from-stdin\`; the workflow a CI key:`,
    `     \`foliwake account keys create --site ${site} --label <pipeline>\`.`,
  ];
}

/** The next steps, for what v1 does not set up itself. */
/** The repository variables of the workflows: the site id and the addresses the server gave the site. */
function workflowVariables(site: string, result: SiteCreateResult): string {
  const preview = result.addresses.preview ? `, FOLIWAKE_PREVIEW_URL=${result.addresses.preview}` : '';
  const live = result.addresses.live ? `, FOLIWAKE_PRODUCTION_URL=${result.addresses.live}` : '';
  return `FOLIWAKE_SITE_ID=${site}${preview}${live}`;
}

export function nextSteps(result: SiteCreateResult, { repository }: { repository: string | null }): string[] {
  const site = result.site;
  const lines = [
    'Next steps (nothing of this was done for you):',
    `  1. GitHub: create the repository and push this project, e.g. \`gh repo create <owner>/${site} --private ` +
      `--source . --push\` (or \`git remote add origin <url>\` and \`git push -u origin ` +
      `main\`).${repository ? '' : ` Then tell the server's operator the repository URL.`}`,
    ...codeOnServer(site),
    `  3. Workflows (.github/workflows, inert until enabled): repository variables ${workflowVariables(site, result)}` +
      '; secrets BRANCH_PREVIEW_SSH_KEY, BRANCH_PREVIEW_KNOWN_HOSTS, BRANCH_PREVIEW_SSH_TARGET in the environment ' +
      '`branch-previews` and PRODUCTION_DEPLOY_SSH_KEY, PRODUCTION_DEPLOY_KNOWN_HOSTS, PRODUCTION_DEPLOY_SSH_TARGET ' +
      "in `production` (the keys and targets come from the server's operator); then BRANCH_PREVIEWS_ENABLED=true " +
      'and FRONTEND_PRODUCTION_DEPLOY_ENABLED=true.',
    `  4. Preview and publish: the pages of content/ ` +
      `${result.releaseOne.state === 'done' ? 'are on the server' : 'reach the server with the first code'}; build ` +
      `the preview in the admin (Publish → Preview), review it, then publish.`,
    '  5. Content sources: the site reads content/ of this project. Google Drive, Git Markdown or Drupal are added ' +
      'later by an admin (admin → Content sources); nothing was connected.',
    '  The new site is served at once on a server that keeps its sites in a database; one that lists them in its ' +
      'file serves it after its listeners restart.',
  ];
  return lines;
}

/** The signed-in caller of the server a request names. */
export async function signedInTo(
  request: Pick<ConnectRequest, 'server' | 'env' | 'pick'>,
  io: ConnectIO,
): Promise<{ server: string; core: CoreCaller }> {
  const server = await chooseServer(request, request.pick);
  const { tokenFor, remoteCallerFor } = await import('./remote/session.js');
  if (!io.callerFor && !tokenFor(server, request.env))
    throw new ConnectRefused(
      signInMoved(server, request.env) ?? `Not signed in to ${server}. Sign in first: \`${C} login ${server}\`.`,
    );
  return { server, core: (io.callerFor ?? remoteCallerFor)(server) };
}

/** The folder's link as read from .foliwake/connection.json: server and site when the file names them. */
export interface ExistingLink {
  server: string | null;
  site: string | null;
}

/** Asks whether to replace the folder's link `from` with `to`; true: replace. */
export type RelinkConfirm = (from: ExistingLink, to: { server: string; site: string }) => Promise<boolean>;

/**
 * The folder's current link, or null when there is no .foliwake/connection.json. Any other content counts as a link
 * (never silently replaced).
 */
export async function existingLink(cwd: string): Promise<ExistingLink | null> {
  let text: string;
  try {
    text = await readFile(path.join(cwd, '.foliwake', 'connection.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    raw = {};
  }
  return {
    server: typeof raw.server === 'string' ? raw.server : null,
    site: typeof raw.site === 'string' ? raw.site : null,
  };
}

export const describeLink = (link: ExistingLink): string =>
  link.server && link.site ? `site ${link.site} on ${link.server}` : 'a link this version cannot read';

/**
 * Before .foliwake/connection.json is replaced with a link to another server or site: the same
 * link stays silent; another one is replaced with --relink, after a yes in a terminal, or refused.
 * Checked before anything is sent, so a refused `site create` creates nothing.
 */
async function checkRelink(
  cwd: string,
  to: { server: string; site: string },
  request: Pick<ConnectRequest, 'relink' | 'confirmRelink' | 'env'>,
  io: ConnectIO,
): Promise<void> {
  const env = request.env;
  const from = await existingLink(cwd);
  if (!from || (from.server !== null && nameOrigin(from.server, env) === to.server && from.site === to.site)) return;
  const change = `${describeLink(from)} → site ${to.site} on ${to.server}`;
  if (request.relink) {
    io.err(`Replacing this folder's link (.foliwake/connection.json): ${change}.`);
    return;
  }
  if (request.confirmRelink) {
    if (await request.confirmRelink(from, to)) return;
    throw new ConnectRefused(`Kept this folder's link to ${describeLink(from)}; nothing was done.`);
  }
  throw new ConnectRefused(
    `This folder is linked to ${describeLink(from)} (.foliwake/connection.json); this would replace it with site ` +
      `${to.site} on ${to.server}. Pass --relink to replace it, or run the command in another folder.`,
  );
}

/**
 * `site unlink`: removes the folder's .foliwake/connection.json. Nothing is sent and nothing changes
 * on the server. Exit 0 unlinked, and 0 when the folder had no link (nothing to do, said plainly);
 * 1 for a file this version cannot read, unless `force`.
 */
export async function unlinkSite(
  request: { cwd: string; force: boolean; env: NodeJS.ProcessEnv },
  io: ConnectIO,
): Promise<{ exit: number; unlinked: ExistingLink | null }> {
  const file = path.join(request.cwd, '.foliwake', 'connection.json');
  const link = await existingLink(request.cwd);
  if (!link) {
    io.out('This folder is not linked to a site (there is no .foliwake/connection.json); nothing to unlink.');
    return { exit: 0, unlinked: null };
  }
  const readable = link.server !== null && link.site !== null;
  if (!readable && !request.force) {
    io.err(
      `This folder's .foliwake/connection.json is ${describeLink(link)}; it was left as it is. Pass --force to ` +
        `remove it anyway.`,
    );
    return { exit: 1, unlinked: null };
  }
  await unlink(file);
  if (!readable)
    io.out('Removed .foliwake/connection.json (a link this version cannot read). Nothing changed on any server.');
  else {
    const origin = nameOrigin(link.server as string, request.env);
    io.out(
      `Unlinked this folder from site ${link.site} on ${origin ? serverDisplay(origin, request.env) : link.server} ` +
        `(.foliwake/connection.json removed). Nothing changed on the server; the site is still there.`,
    );
    io.out(
      `Link it again with \`${C} site link <id>\`, or create a site elsewhere with \`${C} site create <id> --server ` +
        `<server>\`.`,
    );
  }
  return { exit: 0, unlinked: link };
}

/**
 * The folder's link; the server by its name ("cloud" for Foliwake Cloud, else its origin), so a move of the cloud keeps
 * it.
 */
async function writeConnection(
  cwd: string,
  connection: { server: string; site: string; org: string },
  env: NodeJS.ProcessEnv,
): Promise<void> {
  connection = { ...connection, server: serverName(connection.server, env) };
  await mkdir(path.join(cwd, '.foliwake'), { recursive: true });
  await writeFile(path.join(cwd, '.foliwake', 'connection.json'), `${JSON.stringify(connection, null, 2)}\n`);
}

/** The refused or failed answer of a command, or a throw for what is not one. */
function failed(error: unknown, server: string | null, io: ConnectIO, cloud: string | null = null): ConnectOutcome {
  if (error instanceof ConnectRefused) {
    io.err(error.message);
    return { exit: 1, server, operation: null, result: null };
  }
  const coreError = (error as { coreError?: { code: string; message: string; category: string } }).coreError;
  if (!coreError) throw error;
  io.err(`${coreError.code}: ${coreError.message}`);
  if (coreError.category === 'unauthorized' && server) io.err(`Sign in with \`${C} login ${server}\`.`);
  if (coreError.code === 'SERVER_UNREACHABLE' && server !== null && server === cloud) io.err(CLOUD_NOTE);
  return { exit: 1, server, operation: null, result: null };
}

/** What `create` may offer: a new site when an admin somewhere, and the sites to link to. */
export async function connectChoices(
  request: Pick<ConnectRequest, 'server' | 'env'>,
  io: ConnectIO,
): Promise<{ server: string; mayCreate: boolean; sites: string[] }> {
  const { server, core } = await signedInTo(request, io);
  const grant = await core.whoami();
  const mayCreate = grant.installation || grant.memberships.some((m) => m.role === 'admin' && m.sites === null);
  const sites = (await core.sites.list()).sites.filter((site) => mayDevelop(grant, site)).map((site) => site.id);
  return { server, mayCreate, sites };
}

/** Admin or developer of the site's organisation (a membership limited to sites must name it), or the installation. */
function mayDevelop(grant: Grant, site: { id: string; org: string }): boolean {
  if (grant.installation) return true;
  return grant.memberships.some(
    (m) =>
      m.org === site.org &&
      (m.sites === null || m.sites.includes(site.id)) &&
      (m.role === 'admin' || m.role === 'developer'),
  );
}

/**
 * `site link <id>`: the folder to an existing site the account may develop (admin or developer of its
 * organisation). Nothing changes on the server. Exit 0 linked, 1 refused.
 */
export async function linkSite(
  request: Pick<ConnectRequest, 'cwd' | 'server' | 'site' | 'env' | 'pick' | 'relink' | 'confirmRelink'>,
  io: ConnectIO,
): Promise<{
  exit: number;
  server: string | null;
  site: { id: string; org: string; liveUrl: string; previewUrl: string } | null;
}> {
  let server: string | null = null;
  try {
    // The server and the folder's link are settled before anything is sent there.
    server = await chooseServer(request, request.pick);
    await checkRelink(request.cwd, { server, site: request.site }, request, io);
    const signed = await signedInTo({ ...request, server }, io);
    const grant = await signed.core.whoami();
    const site = (await signed.core.sites.list()).sites.find((candidate) => candidate.id === request.site);
    if (!site)
      throw new ConnectRefused(
        `There is no site "${request.site}" on ${server} that this account may see. \`${C} site list --server ` +
          `${server}\` lists them.`,
      );
    if (!mayDevelop(grant, site))
      throw new ConnectRefused(
        `Linking a project to ${site.id} needs the developer or admin role in organisation ${site.org}.`,
      );
    await writeConnection(request.cwd, { server, site: site.id, org: site.org }, request.env);
    io.out(
      `Linked this folder to site ${site.id} (organisation ${site.org}) on ${serverDisplay(server, request.env)}.`,
    );
    if (site.previewUrl !== '-') io.out(`Preview: ${site.previewUrl}`);
    if (site.liveUrl !== '-') io.out(`Live:    ${site.liveUrl}`);
    return {
      exit: 0,
      server,
      site: { id: site.id, org: site.org, liveUrl: site.liveUrl, previewUrl: site.previewUrl },
    };
  } catch (error) {
    const outcome = failed(error, server, io, cloudOrigin(request.env));
    return { exit: outcome.exit, server, site: null };
  }
}

/** `site create <id>`: the project's site on the server. Exit 0 created, 1 refused or failed. */
export async function createSite(request: ConnectRequest, io: ConnectIO): Promise<ConnectOutcome> {
  let server: string | null = null;
  try {
    const signed = await signedInTo(request, io);
    server = signed.server;
    const site = request.site;
    if (!CREATED_SITE_ID.test(site))
      throw new ConnectRefused(
        `The site id "${site}" cannot be used on a server: at most 12 lowercase letters, digits and single inner ` +
          `hyphens, starting with a letter.`,
      );
    await checkRelink(request.cwd, { server, site }, request, io);
    let code: { bundle: string; commit: string } | null = null;
    if (request.code) {
      const commit = await projectCommit(request.cwd, request.env);
      if ('none' in commit)
        io.err(`No code is sent (${commit.none}): release 1 waits for the first \`${C} code prepare\` on the server.`);
      else {
        if (commit.dirty) io.err(`Uncommitted changes are not sent: release 1 is commit ${commit.commit.slice(0, 7)}.`);
        code = { bundle: commit.bundle, commit: commit.commit };
      }
    }
    const core = signed.core;
    io.out(`Creating site ${site} on ${serverDisplay(server, request.env)}…`);
    const accepted = await core.sites.create({
      site,
      ...(request.org ? { org: request.org } : {}),
      repository: request.repository ?? null,
      code,
      expect: { absent: true },
      idempotencyKey: `connect-${randomBytes(12).toString('hex')}`,
    });
    const { waitInSlices } = await import('./remote/wait-slices.js');
    const operation = await waitInSlices(
      (sliceMs) => core.operations.wait({ site, id: accepted.id, until: 'commit', timeoutMs: sliceMs }),
      { until: 'commit', timeoutMs: CONNECT_WAIT_MS },
    );
    if (operation.state !== 'succeeded') {
      const error = operation.error;
      const after =
        operation.state === 'failed'
          ? `What this attempt made was undone; \`${C} site create ${site}\` may be run again.`
          : 'Whether release 1 was made is not known yet; the server operator runs `foliwake operation recover`.';
      io.err(
        `The site was not created (${operation.state}${error ? `: ${error.code}: ${error.message}` : ''}). ${after}`,
      );
      return { exit: 1, server, operation, result: null };
    }
    const result = operation.result as SiteCreateResult;
    await writeConnection(request.cwd, { server, site: result.site, org: result.org }, request.env);
    io.out(`Created site ${result.site} in organisation ${result.org} on ${serverDisplay(server, request.env)}.`);
    if (result.releaseOne.state === 'done')
      io.out(
        `Release 1: ${result.releaseOne.siteRelease} with code ${result.releaseOne.codeRelease} (commit ` +
          `${result.releaseOne.commit.slice(0, 7)}); nothing is published yet.`,
      );
    else io.out(`Release 1 waits for the first \`${C} code prepare\` on the server.`);
    if (result.addresses.preview) io.out(`Preview: ${result.addresses.preview}`);
    if (result.addresses.live) io.out(`Live:    ${result.addresses.live}`);
    if (result.addresses.branchPattern) io.out(`Branches: ${result.addresses.branchPattern}`);
    io.out();
    for (const line of nextSteps(result, { repository: request.repository ?? null })) io.out(line);
    return { exit: 0, server, operation, result };
  } catch (error) {
    return failed(error, server, io, cloudOrigin(request.env));
  }
}
