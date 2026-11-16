// create-foliwake: the target folder, and writing into it as one transaction.
//
// Guarantees:
//  - Git metadata is never a destination and never touched: a path with a `.git`
//    component, a real path (after resolving links above the target) running
//    through one, or a folder shaped like a repository's metadata (HEAD, objects/,
//    refs/: a bare repository) is refused; the target's own `.git` is never moved
//    or read; clearing refuses a folder holding other repositories (`.git` at
//    any depth, or a bare one), since that would destroy their history.
//  - Nothing is written through a symbolic link inside the destination: the
//    target itself must not be a link, every existing folder on the way to a
//    generated file must be a real folder (checked before and while writing),
//    and files are created exclusively (O_EXCL never follows a link).
//    Links ABOVE the target (macOS /tmp → /private/tmp, a linked home) are
//    resolved once; the work then happens on the real path.
//  - All or nothing: a file is owned as soon as its exclusive create succeeds,
//    so a failure removes every file and folder this run made; `--overwrite`
//    first moves the existing entries into a hidden folder inside the target,
//    deletes them only after every file is written, and moves them back on failure.
import { randomBytes } from 'node:crypto';
import { type FileHandle, lstat, mkdir, open, readdir, realpath, rename, rm, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';

import { CreateUsageError, type ExistingFiles } from './options.js';

export type FolderState = { kind: 'missing' } | { kind: 'empty' } | { kind: 'files'; entries: string[] };

export interface Destination {
  /** Real absolute path (links above it resolved; the target itself is not a link). */
  target: string;
  state: FolderState;
}

const isGitName = (name: string): boolean => name.toLowerCase() === '.git';
const BACKUP_PREFIX = '.foliwake-create-old-';

async function lstatOrNull(file: string) {
  try {
    return await lstat(file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    if (code === 'ENOTDIR') throw new CreateUsageError(`${file}: a part of this path is a file, not a folder.`);
    throw error;
  }
}

/** True for a folder holding a repository's metadata (HEAD, objects/, refs/), as a bare repository does. */
async function looksLikeGitDir(dir: string): Promise<boolean> {
  const [head, objects, refs] = await Promise.all(
    ['HEAD', 'objects', 'refs'].map((name) => lstat(path.join(dir, name)).catch(() => null)),
  );
  return Boolean(head?.isFile() && objects?.isDirectory() && refs?.isDirectory());
}

function gitMetadataProblem(shown: string): CreateUsageError {
  return new CreateUsageError(
    `${shown} is inside Git metadata (a .git folder or a bare repository); choose a folder outside it.`,
  );
}

/** Resolves and checks the target folder; refuses Git metadata, a link or a file there. */
export async function resolveDestination(cwd: string, folder: string): Promise<Destination> {
  const absolute = path.resolve(cwd, folder);
  if (absolute.split(path.sep).some(isGitName)) throw gitMetadataProblem(folder);
  // The nearest existing folder at or above the target, and what is still missing below it.
  let base = absolute;
  const missing: string[] = [];
  for (;;) {
    const stats = await lstatOrNull(base);
    if (stats) {
      if (base === absolute && stats.isSymbolicLink())
        throw new CreateUsageError(`${folder} is a symbolic link; choose a real folder.`);
      if (base === absolute && !stats.isDirectory())
        throw new CreateUsageError(`${folder} exists and is not a folder; choose another name.`);
      break;
    }
    const parent = path.dirname(base);
    if (parent === base) break;
    missing.unshift(path.basename(base));
    base = parent;
  }
  const realBase = await realpath(base);
  if (!(await lstat(realBase)).isDirectory()) throw new CreateUsageError(`${folder}: ${base} is not a folder.`);
  const target = path.join(realBase, ...missing);
  if (target.split(path.sep).some(isGitName)) throw gitMetadataProblem(folder);
  for (let at = realBase; ; at = path.dirname(at)) {
    if (await looksLikeGitDir(at)) throw gitMetadataProblem(folder);
    if (path.dirname(at) === at) break;
  }
  if (missing.length) return { target, state: { kind: 'missing' } };
  const entries = (await readdir(target)).filter((name) => !isGitName(name)).sort();
  return { target, state: entries.length === 0 ? { kind: 'empty' } : { kind: 'files', entries } };
}

/** Repositories below the target (other than its own .git) that clearing would destroy; never follows links. */
export async function nestedRepositories(target: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(target, full);
      if (isGitName(entry.name)) {
        if (depth > 0) found.push(relative);
        continue; // the target's own .git: kept, never read
      }
      if (entry.isDirectory()) {
        if (await looksLikeGitDir(full)) found.push(relative);
        else await walk(full, depth + 1);
      }
    }
  };
  await walk(target, 0);
  return found.sort();
}

/**
 * Problems of the generated paths in a folder that keeps its files: an existing
 * file to be replaced, or an existing part of a path that is a link or a file.
 */
export async function pathProblems(
  target: string,
  files: readonly string[],
): Promise<{ taken: string[]; unsafe: string[] }> {
  const taken: string[] = [];
  const unsafe = new Set<string>();
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const relative = parts.slice(0, i).join('/');
      const stats = await lstatOrNull(path.join(target, ...parts.slice(0, i)));
      if (!stats) break;
      if (i === parts.length) taken.push(file);
      else if (stats.isSymbolicLink() || !stats.isDirectory()) {
        unsafe.add(relative);
        break;
      }
    }
  }
  return { taken, unsafe: [...unsafe].sort() };
}

/** How a file's bytes are written and the replaced entries removed (tests inject failures here). */
export interface WriteHooks {
  writeBytes?: (handle: FileHandle, bytes: Buffer, file: string) => Promise<void>;
  removeBackup?: (backup: string) => Promise<void>;
}
const defaultWrite = (handle: FileHandle, bytes: Buffer): Promise<void> => handle.writeFile(bytes);
const defaultRemove = (backup: string): Promise<void> => rm(backup, { recursive: true, force: true });

/** The project is written. With --overwrite, `leftover` is set when the replaced entries could not all be deleted. */
export interface WriteResult {
  leftover: { folder: string; reason: string } | null;
}

/** What this run made, so exactly that can be undone. */
class Owned {
  readonly dirs: string[] = [];
  readonly files: string[] = [];
  moved: { backup: string; names: string[] } | null = null;

  /** Removes our files and folders, then puts moved entries back. Returns paths it could not restore or remove. */
  async undo(): Promise<string[]> {
    const left: string[] = [];
    for (const file of [...this.files].reverse())
      await unlink(file).catch((e: NodeJS.ErrnoException) => e.code !== 'ENOENT' && left.push(file));
    for (const dir of [...this.dirs].reverse())
      await rmdir(dir).catch((e: NodeJS.ErrnoException) => e.code !== 'ENOENT' && left.push(dir));
    if (this.moved) {
      const { backup, names } = this.moved;
      for (const name of names)
        await rename(path.join(backup, name), path.join(path.dirname(backup), name)).catch(() =>
          left.push(path.join(backup, name)),
        );
      await rmdir(backup).catch(() => left.push(backup));
    }
    return left;
  }
}

/** Creates one folder (not recursively) or accepts an existing real one; never a link. */
async function enterFolder(dir: string, owned: Owned): Promise<void> {
  try {
    await mkdir(dir);
    owned.dirs.push(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const stats = await lstat(dir);
    if (stats.isSymbolicLink() || !stats.isDirectory())
      throw new CreateUsageError(`${dir} is a symbolic link or a file; nothing is written through it.`);
  }
}

/**
 * Writes the project as one transaction. `existing: 'clear'` moves the current
 * entries (never .git) aside first and deletes them only after every file is written.
 */
export async function writeProject(
  target: string,
  files: ReadonlyArray<{ path: string; bytes: Buffer }>,
  existing: ExistingFiles | null,
  hooks: WriteHooks = {},
): Promise<WriteResult> {
  const writeBytes = hooks.writeBytes ?? defaultWrite;
  const owned = new Owned();
  try {
    // The target and its missing parents, one level at a time.
    const chain: string[] = [];
    for (let at = target; !(await lstatOrNull(at)); at = path.dirname(at)) chain.unshift(at);
    for (const dir of chain) await enterFolder(dir, owned);
    await enterFolder(target, owned);

    if (existing === 'clear') {
      const backup = path.join(target, `${BACKUP_PREFIX}${randomBytes(6).toString('hex')}`);
      await mkdir(backup);
      owned.moved = { backup, names: [] };
      for (const name of await readdir(target)) {
        if (isGitName(name) || path.join(target, name) === backup) continue;
        await rename(path.join(target, name), path.join(backup, name));
        owned.moved.names.push(name);
      }
    }

    for (const file of files) {
      const parts = file.path.split('/');
      let dir = target;
      for (const part of parts.slice(0, -1)) await enterFolder((dir = path.join(dir, part)), owned);
      const absolute = path.join(dir, parts.at(-1)!);
      const handle = await open(absolute, 'wx');
      owned.files.push(absolute); // ours from here on, even if writing fails
      try {
        await writeBytes(handle, file.bytes, file.path);
      } finally {
        await handle.close();
      }
    }
  } catch (error) {
    const left = await owned.undo();
    const note = left.length ? ` Could not undo: ${left.join(', ')}.` : '';
    const restored = owned.moved ? ' The existing files were put back.' : '';
    if (error instanceof CreateUsageError)
      throw new CreateUsageError(`${error.message} Nothing was written.${restored}${note}`);
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const file = (error as NodeJS.ErrnoException).path ?? 'A file';
      const what = `${file} appeared while the project was being written; nothing was replaced or kept.`;
      throw new CreateUsageError(`${what}${restored}${note}`);
    }
    (error as Error).message = `${(error as Error).message} — nothing was kept.${restored}${note}`;
    throw error;
  }
  // Every file is written: only now are the replaced entries deleted. The project is complete
  // either way; a failure here is reported (what is left, and where), never undone.
  if (!owned.moved) return { leftover: null };
  try {
    await (hooks.removeBackup ?? defaultRemove)(owned.moved.backup);
    return { leftover: null };
  } catch (error) {
    return {
      leftover: {
        folder: owned.moved.backup,
        reason: (error as NodeJS.ErrnoException).code ?? (error as Error).message,
      },
    };
  }
}
