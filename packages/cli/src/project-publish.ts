// `foliwake publish` and `foliwake project unpublish` in a folder linked to a site.
// Publish: with no paths, the pages the last
// `foliwake preview` of this folder changed, with `expect` filled from it; paths of
// files or folders under content/ choose pages by their front matter id. The API
// always requires expect; this only fills it in. A terminal asks before anything
// goes live; scripts pass --yes.
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';

import type { CoreCaller, Operation } from './core-types.js';
import { COMMAND } from './settings.js';
import { frontMatterId } from './lib/front-matter.js';
import { ConnectRefused, type ConnectIO, signedInTo } from './connect.js';
import { type LastPreview, lastPreviewFile, readConnection } from './project-preview.js';

const C = COMMAND;
const WAIT_MS = 10 * 60 * 1000;

export interface PublishRequest {
  cwd: string;
  env: NodeJS.ProcessEnv;
  paths: string[];
  expect?: string | undefined;
  yes: boolean;
  /** Asks the question in a terminal; null: no terminal. */
  confirm: ((question: string) => Promise<boolean>) | null;
}

/**
 * Page ids of the .md files under the given paths, read as the server's reader reads them (the
 * front-matter `id`, lib/front-matter.ts). The same rules as `preview`'s push: real
 * files and folders inside content/ only, no symbolic link anywhere (so no cycle either), no hidden name.
 */
async function pagesOf(cwd: string, paths: readonly string[]): Promise<Array<{ file: string; id: string }>> {
  const content = await realpath(path.join(cwd, 'content')).catch(() => {
    throw new ConnectRefused('This folder has no content/ folder of pages.');
  });
  const found: Array<{ file: string; id: string }> = [];
  async function visit(target: string): Promise<void> {
    const info = await lstat(target).catch(() => null);
    if (!info) throw new ConnectRefused(`${path.relative(cwd, target)} does not exist.`);
    if (info.isSymbolicLink())
      throw new ConnectRefused(
        `${path.relative(cwd, target)} is a symbolic link; pages are real files under content/.`,
      );
    if (info.isDirectory()) {
      for (const entry of (await readdir(target)).sort())
        if (!entry.startsWith('.')) await visit(path.join(target, entry));
      return;
    }
    if (!info.isFile() || !target.endsWith('.md')) return;
    const id = frontMatterId(await readFile(target));
    if (!id) throw new ConnectRefused(`${path.relative(cwd, target)} has no id in its front matter.`);
    found.push({ file: path.relative(cwd, target), id });
  }
  for (const given of paths) {
    const lexical = path.resolve(cwd, given);
    // Every folder on the way is checked by its real path: a linked folder above the file leaves content/.
    const real = await realpath(path.dirname(lexical)).then(
      (dir) => path.join(dir, path.basename(lexical)),
      () => lexical,
    );
    if (real !== content && !real.startsWith(`${content}${path.sep}`))
      throw new ConnectRefused(`${given} is not inside content/.`);
    await visit(real);
  }
  return found;
}

async function waitFor(core: CoreCaller, operation: Operation): Promise<Operation> {
  const { waitInSlices } = await import('./remote/wait-slices.js');
  return waitInSlices(
    (sliceMs) => core.operations.wait({ site: operation.site, id: operation.id, until: 'commit', timeoutMs: sliceMs }),
    { until: 'commit', timeoutMs: WAIT_MS },
  );
}

async function confirmed(request: PublishRequest, question: string): Promise<boolean> {
  if (request.yes) return true;
  if (!request.confirm)
    throw new ConnectRefused(
      `Not a terminal: pass --yes to ${question.toLowerCase().replace(/\?$/, '')} without being asked.`,
    );
  return request.confirm(question);
}

async function finish(operation: Operation, io: ConnectIO, verb: string): Promise<number> {
  const result = operation.result as
    | { siteRelease?: string | null; generation?: number | null; code?: string | null; message?: string | null }
    | undefined;
  if (operation.state !== 'succeeded') {
    io.err(
      `${verb} did not succeed ` +
        `(${operation.state}${operation.error ? `: ${operation.error.code}: ${operation.error.message}` : ''}).`,
    );
    if (operation.error?.code === 'PUBLISH_PREVIEW_CHANGED')
      io.err(`The preview changed since your last \`${C} preview\`; run it again.`);
    return 1;
  }
  io.out(`${verb}: live is release ${result?.generation ?? '?'} (${result?.siteRelease ?? '?'}).`);
  if (operation.delivery?.state === 'pending')
    io.out(`The cache refresh is still running; \`${C} operation recover\` on the server finishes it.`);
  return 0;
}

export async function publishProject(
  request: PublishRequest,
  io: ConnectIO,
): Promise<{ exit: number; pages: string[]; operation: Operation | null }> {
  try {
    const connection = await readConnection(request.cwd);
    if (!connection)
      throw new ConnectRefused(
        `This folder is not linked to a site: run \`${C} site create <id>\` or \`${C} site link <id>\` first.`,
      );
    let expect = request.expect ?? null;
    if (!expect) {
      const last = await readFile(lastPreviewFile(request.cwd), 'utf8').then(
        (text) => JSON.parse(text) as LastPreview,
        () => null,
      );
      if (!last || last.site !== connection.site || last.server !== connection.server)
        throw new ConnectRefused(
          `There is no preview of this folder to publish: run \`${C} preview\` first (or name one with --expect sr_…).`,
        );
      expect = last.siteRelease;
    }
    const { core } = await signedInTo({ server: connection.server, env: request.env }, io);
    const changes = await core.channels.changes({ site: connection.site, preview: expect }).catch((error: unknown) => {
      if ((error as { coreError?: { code: string } }).coreError?.code === 'PREVIEW_CHANGED')
        throw new ConnectRefused(
          `The preview changed since your last \`${C} preview\`; run it again, review it, then publish.`,
        );
      throw error;
    });
    const changed = new Map(changes.pages.map((page) => [page.id, page]));
    let pages: string[];
    if (request.paths.length === 0) pages = [...changed.keys()];
    else {
      pages = [];
      for (const { file, id } of await pagesOf(request.cwd, request.paths)) {
        if (changed.has(id)) pages.push(id);
        else io.err(`${file}: nothing to publish (not in this preview, or live has it as it is).`);
      }
    }
    pages = [...new Set(pages)];
    if (pages.length === 0) {
      io.out('Nothing to publish: the preview changes no page on live.');
      return { exit: 0, pages, operation: null };
    }
    io.out(`From preview ${expect}:`);
    for (const id of pages)
      io.out(`  ${changed.get(id)?.change === 'new' ? 'new    ' : 'changed'}  ${id}  (${changed.get(id)?.path ?? ''})`);
    if (!(await confirmed(request, `Publish these ${pages.length} page(s) to live?`))) {
      io.out('Nothing was published.');
      return { exit: 0, pages: [], operation: null };
    }
    const operation = await waitFor(
      core,
      await core.channels.publish({ site: connection.site, pages, expect: { preview: expect } }),
    );
    return { exit: await finish(operation, io, `Published ${pages.length} page(s)`), pages, operation };
  } catch (error) {
    return { exit: failure(error, io), pages: [], operation: null };
  }
}

export async function unpublishProject(
  request: PublishRequest,
  io: ConnectIO,
): Promise<{ exit: number; pages: string[]; operation: Operation | null }> {
  try {
    const connection = await readConnection(request.cwd);
    if (!connection)
      throw new ConnectRefused(
        `This folder is not linked to a site: run \`${C} site create <id>\` or \`${C} site link <id>\` first.`,
      );
    if (request.paths.length === 0)
      throw new ConnectRefused('Name the pages to take off live: files or folders under content/.');
    const pages = [...new Set((await pagesOf(request.cwd, request.paths)).map((page) => page.id))];
    const { core } = await signedInTo({ server: connection.server, env: request.env }, io);
    const live = request.expect ?? (await core.sites.status({ site: connection.site })).live?.site_release;
    if (!live) throw new ConnectRefused('This site has nothing live.');
    io.out(`From live ${live}: ${pages.join(', ')}`);
    if (!(await confirmed(request, `Take these ${pages.length} page(s) off live?`))) {
      io.out('Nothing was changed.');
      return { exit: 0, pages: [], operation: null };
    }
    const operation = await waitFor(
      core,
      await core.channels.unpublish({ site: connection.site, pages, expect: { live } }),
    );
    return { exit: await finish(operation, io, `Took ${pages.length} page(s) off live`), pages, operation };
  } catch (error) {
    return { exit: failure(error, io), pages: [], operation: null };
  }
}

function failure(error: unknown, io: ConnectIO): number {
  if (error instanceof ConnectRefused) {
    io.err(error.message);
    return 1;
  }
  const coreError = (error as { coreError?: { code: string; message: string } }).coreError;
  if (!coreError) throw error;
  io.err(`${coreError.code}: ${coreError.message}`);
  return 1;
}

/** A yes/no question in a terminal (null when stdin or stdout is not one). */
export function terminalConfirm(
  stdin: Readable & { isTTY?: boolean },
  stdout: Writable & { isTTY?: boolean },
): PublishRequest['confirm'] {
  if (!stdin.isTTY || !stdout.isTTY) return null;
  return async (message) => {
    const { confirm, isCancel } = await import('@clack/prompts');
    const answer = await confirm({ input: stdin, output: stdout, message, initialValue: false });
    return !isCancel(answer) && answer === true;
  };
}
