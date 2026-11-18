// `foliwake preview` in a project folder linked to a site (`.foliwake/connection.json`,
// written by `site create` / `site link`): sends the folder's pages and its last commit's
// code to the server and rebuilds the site's preview there.
// Pages may be uncommitted (they are content); code must be committed.
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CoreCaller, Operation } from './core-types.js';
import { COMMAND } from './settings.js';
import { ConnectRefused, type ConnectIO, projectCommit, signedInTo } from './connect.js';

const C = COMMAND;
const CONTENT = 'content';
const PUSHED_FILE = /\.(md|png|jpe?g|gif|webp|avif)$/i;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;
const MAX_PUSH_BYTES = 500_000;
const WAIT_MS = 10 * 60 * 1000;

export interface Connection {
  server: string;
  site: string;
  org: string;
}

export interface LastPreview {
  server: string;
  site: string;
  siteRelease: string;
  commit: string | null;
  at: string;
}

export const connectionFile = (cwd: string): string => path.join(cwd, '.foliwake', 'connection.json');
export const lastPreviewFile = (cwd: string): string => path.join(cwd, '.foliwake', 'last-preview.json');

export async function readConnection(cwd: string): Promise<Connection | null> {
  try {
    const raw = JSON.parse(await readFile(connectionFile(cwd), 'utf8')) as Partial<Connection>;
    return typeof raw.server === 'string' && typeof raw.site === 'string' && typeof raw.org === 'string'
      ? { server: raw.server, site: raw.site, org: raw.org }
      : null;
  } catch {
    return null;
  }
}

/** The pages and images of content/: real files only, no hidden names, no links. */
async function contentFiles(cwd: string): Promise<Array<{ path: string; data: string }>> {
  const root = path.join(cwd, CONTENT);
  const out: Array<{ path: string; data: string }> = [];
  let total = 0;
  async function walk(dir: string, rel: string[]): Promise<void> {
    for (const entry of (await readdir(dir)).sort()) {
      if (!SEGMENT.test(entry)) continue;
      const file = path.join(dir, entry);
      const info = await lstat(file);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await walk(file, [...rel, entry]);
      else if (info.isFile() && PUSHED_FILE.test(entry)) {
        const bytes = await readFile(file);
        total += bytes.length;
        if (total > MAX_PUSH_BYTES)
          throw new ConnectRefused(
            `The pages and images of ${CONTENT}/ are larger than ${MAX_PUSH_BYTES / 1000} KB, more than one push ` +
              `takes in this version.`,
          );
        out.push({ path: [...rel, entry].join('/'), data: bytes.toString('base64') });
      }
    }
  }
  await walk(root, []).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new ConnectRefused(`This folder has no ${CONTENT}/ folder of pages.`);
    throw error;
  });
  if (!out.some((file) => file.path.endsWith('.md'))) throw new ConnectRefused(`${CONTENT}/ holds no page (.md).`);
  return out;
}

async function waitFor(core: CoreCaller, operation: Operation): Promise<Operation> {
  const { waitInSlices } = await import('./remote/wait-slices.js');
  return waitInSlices(
    (sliceMs) => core.operations.wait({ site: operation.site, id: operation.id, until: 'commit', timeoutMs: sliceMs }),
    { until: 'commit', timeoutMs: WAIT_MS },
  );
}

const failure = (what: string, operation: Operation): ConnectRefused =>
  new ConnectRefused(
    `${what} did not succeed ` +
      `(${operation.state}${operation.error ? `: ${operation.error.code}: ${operation.error.message}` : ''}).`,
  );

/** Pushes the pages and code, previews them, prints the address. Exit 0 previewed, 1 refused or failed. */
export async function previewProject(
  { cwd, env }: { cwd: string; env: NodeJS.ProcessEnv },
  io: ConnectIO,
): Promise<{ exit: number; siteRelease: string | null; previewUrl: string | null }> {
  try {
    const connection = await readConnection(cwd);
    if (!connection)
      throw new ConnectRefused(
        `This folder is not linked to a site: run \`${C} site create <id>\` or \`${C} site link <id>\` first.`,
      );
    const { core, server } = await signedInTo({ server: connection.server, env }, io);
    const commit = await projectCommit(cwd, env, { codeOnly: true });
    if ('none' in commit) throw new ConnectRefused(`The code is not sent: ${commit.none}.`);
    if (commit.dirty)
      throw new ConnectRefused(
        'The code has uncommitted changes (components/, scripts/, styles/ or other files outside content/): commit ' +
          'them, then preview again. Pages in content/ may stay uncommitted.',
      );
    const files = await contentFiles(cwd);

    const source = (await core.sources.list({ site: connection.site })).sources.find(
      (candidate) => candidate.plugin === 'cli-push',
    );
    if (!source)
      throw new ConnectRefused(
        `Site ${connection.site} on ${server} takes no pages from a project folder (no cli-push source).`,
      );
    io.out(`Sending ${files.length} file(s) of ${CONTENT}/ to ${connection.site} on ${server}…`);
    const pushed = await whileBusy(
      () =>
        core.sources.push({
          site: connection.site,
          source: source.id,
          files,
          expect: { selected: source.selected?.snapshot ?? null },
        }),
      {
        onWait: () => io.out('The previous push is still being read on the server; trying again…'),
      },
    );
    const synced = await waitFor(core, pushed);
    if (synced.state !== 'succeeded') throw failure('Reading the pages', synced);

    const status = await core.sites.status({ site: connection.site });
    io.out(`Building the preview with code ${commit.commit.slice(0, 7)}…`);
    const previewed = await waitFor(
      core,
      await core.channels.preview({
        site: connection.site,
        pages: null,
        expect: { preview: status.preview?.site_release ?? null },
        code: { bundle: commit.bundle, commit: commit.commit },
      }),
    );
    const result = previewed.result as
      { siteRelease?: string | null; diagnostics?: Array<{ file: string; line: number; message: string }> } | undefined;
    for (const diagnostic of result?.diagnostics ?? [])
      io.err(`  ${diagnostic.file}:${diagnostic.line}: ${diagnostic.message}`);
    if (previewed.state !== 'succeeded' || !result?.siteRelease) throw failure('The preview', previewed);
    const previewUrl =
      (await core.sites.list()).sites.find((candidate) => candidate.id === connection.site)?.previewUrl ?? null;
    const last: LastPreview = {
      server: connection.server,
      site: connection.site,
      siteRelease: result.siteRelease,
      commit: commit.commit,
      at: new Date().toISOString(),
    };
    await mkdir(path.dirname(lastPreviewFile(cwd)), { recursive: true });
    await writeFile(lastPreviewFile(cwd), `${JSON.stringify(last, null, 2)}\n`);
    io.out(`Preview ${result.siteRelease} is ready${previewUrl && previewUrl !== '-' ? `: ${previewUrl}` : ''}.`);
    io.out(
      `Publish it with \`${C} publish --expect ${result.siteRelease} <page-id>…\` on the server, or in the admin.`,
    );
    return { exit: 0, siteRelease: result.siteRelease, previewUrl: previewUrl === '-' ? null : previewUrl };
  } catch (error) {
    if (error instanceof ConnectRefused) {
      io.err(error.message);
      return { exit: 1, siteRelease: null, previewUrl: null };
    }
    const coreError = (error as { coreError?: { code: string; message: string } }).coreError;
    if (!coreError) throw error;
    io.err(`${coreError.code}: ${coreError.message}`);
    return { exit: 1, siteRelease: null, previewUrl: null };
  }
}

/**
 * Calls `fn` again while the server answers a retryable `busy` refusal (PUSH_BUSY, PREVIEW_BUSY), with a
 * growing pause, up to `limitMs`; then the last refusal stands ("try again").
 */
export async function whileBusy<T>(
  fn: () => Promise<T>,
  {
    limitMs = 120_000,
    firstDelayMs = 1_000,
    onWait = () => {},
    sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: { limitMs?: number; firstDelayMs?: number; onWait?: () => void; sleep?: (ms: number) => Promise<unknown> } = {},
): Promise<T> {
  const deadline = Date.now() + limitMs;
  for (let delay = firstDelayMs, told = false; ; delay = Math.min(delay * 2, 10_000)) {
    try {
      return await fn();
    } catch (error) {
      const coreError = (error as { coreError?: { category: string; retryable: boolean } }).coreError;
      if (!coreError || coreError.category !== 'busy' || !coreError.retryable || Date.now() + delay > deadline)
        throw error;
      if (!told) onWait();
      told = true;
      await sleep(delay);
    }
  }
}
