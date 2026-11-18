// Watches the local frontend code of `foliwake dev --watch`: components/,
// scripts/ and styles/ under the code root (the same directories the dev
// server serves). Local files only: nothing here reads the network or the
// store.
//
// Change detection is Chokidar 6 (exact pin). Foliwake chooses its backend
// (resolveWatchPolling): stat polling on macOS, native fs.watch events
// elsewhere, with an explicit override. What is reported stays ours: the
// cwd-relative posix paths whose content (SHA-256) appeared, changed or
// disappeared, so a touch, an identical rewrite or a duplicate event reports
// nothing, and the files present at start are the baseline.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { watch as chokidarWatch, type FSWatcher } from 'chokidar';

import { CODE_FILE_EXTENSIONS } from '@foliwake/site-check/formats/code-files';

/** The code directories served (and watched) under the code root. */
export const CODE_DIRECTORIES = ['components', 'scripts', 'styles', 'templates'] as const;
/** The file types served from them. */
export const CODE_EXTENSIONS: readonly string[] = CODE_FILE_EXTENSIONS;
/** Default polling interval (ms) when polling is chosen. */
export const DEFAULT_CODE_POLLING_INTERVAL_MS = 1000;

export interface CodeWatcherOptions {
  /** absolute code root */
  cwd: string;
  /** called with the changed cwd-relative posix paths (added, changed or removed) */
  onChange: (files: string[]) => void;
  onError?: (error: unknown) => void;
  /** stat polling (true) or native fs.watch events (false); see resolveWatchPolling */
  usePolling: boolean;
  /** polling interval in ms (default 1000; polling only) */
  pollingIntervalMs?: number;
  /** quiet window that merges watcher events into one batch (default 50) */
  eventDelayMs?: number;
}

export interface CodeWatcher {
  start(): Promise<void>;
  /** Re-reads every known and watched code file now; resolves with the files that changed. */
  rescan(): Promise<string[]>;
  stop(): Promise<void>;
  /** The backend Chokidar actually runs ('polling' or 'auto'); null before start / after stop. */
  backend(): string | null;
}

export type WatchModeSource = 'option' | 'env' | 'chokidar-env' | 'platform';

export interface WatchModeChoice {
  usePolling: boolean;
  /** which setting decided */
  source: WatchModeSource;
  /** one line for the start-up log: the mode, what decided it and what it overrode */
  description: string;
  /** a FOLIWAKE_WATCH_POLLING value that is not recognised (ignored) */
  invalid?: string;
  /** environment variables that were set but did not decide (lower precedence) */
  overridden: string[];
}

const TRUE_VALUES = ['1', 'true', 'yes'];
const FALSE_VALUES = ['0', 'false', 'no'];

/** Chokidar 6's own reading of CHOKIDAR_USEPOLLING: 0/false off, any other non-empty value on. */
function chokidarEnvPolling(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === 'false' || lower === '0' ? false : lower !== '';
}

/**
 * Chooses polling or native events for the code watcher. Precedence (first that is set wins):
 * 1. the command line: `dev --watch --watch-polling` / `--no-watch-polling`;
 * 2. FOLIWAKE_WATCH_POLLING=1|true|yes or 0|false|no (any other value is ignored and reported);
 * 3. CHOKIDAR_USEPOLLING (Chokidar's own variable; same reading as Chokidar);
 * 4. the platform: polling on macOS (native directory events / FSEvents were measured silent
 *    on a development Mac), native events elsewhere (Linux measured; Windows not measured).
 * The watcher is always created with this decision: createCodeWatcher hides CHOKIDAR_USEPOLLING
 * and CHOKIDAR_INTERVAL from Chokidar, which would otherwise override it.
 */
export function resolveWatchPolling({
  option,
  env = process.env,
  platform = process.platform,
}: { option?: boolean; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {}): WatchModeChoice {
  const raw = env.FOLIWAKE_WATCH_POLLING;
  const value = raw?.trim().toLowerCase();
  const foliwake =
    value && TRUE_VALUES.includes(value) ? true : value && FALSE_VALUES.includes(value) ? false : undefined;
  const invalid = value && foliwake === undefined ? raw : undefined;
  const chokidarRaw = env.CHOKIDAR_USEPOLLING;
  const chokidar = chokidarRaw === undefined ? undefined : chokidarEnvPolling(chokidarRaw);
  const mode = (polling: boolean) => (polling ? 'polling' : 'native events');
  const done = (usePolling: boolean, source: WatchModeSource, why: string, overridden: string[]): WatchModeChoice => ({
    usePolling,
    source,
    description: `${mode(usePolling)} (${why}${overridden.length ? `; overrides ${overridden.join(', ')}` : ''})`,
    overridden,
    ...(invalid === undefined ? {} : { invalid }),
  });
  const envOverridden = (...names: Array<[string, unknown]>) =>
    names.filter(([, v]) => v !== undefined).map(([n]) => n);
  if (option !== undefined) {
    return done(
      option,
      'option',
      option ? '--watch-polling' : '--no-watch-polling',
      envOverridden(['FOLIWAKE_WATCH_POLLING', foliwake], ['CHOKIDAR_USEPOLLING', chokidarRaw]),
    );
  }
  if (foliwake !== undefined)
    return done(foliwake, 'env', `FOLIWAKE_WATCH_POLLING=${raw}`, envOverridden(['CHOKIDAR_USEPOLLING', chokidarRaw]));
  if (chokidar !== undefined) return done(chokidar, 'chokidar-env', `CHOKIDAR_USEPOLLING=${chokidarRaw}`, []);
  const usePolling = platform === 'darwin';
  return done(
    usePolling,
    'platform',
    usePolling
      ? 'macOS default; --no-watch-polling or FOLIWAKE_WATCH_POLLING=0 for native events'
      : `${platform} default; --watch-polling or FOLIWAKE_WATCH_POLLING=1 to poll`,
    [],
  );
}

/**
 * Creates the Chokidar watcher with our decision only. Chokidar 6 reads CHOKIDAR_USEPOLLING and
 * CHOKIDAR_INTERVAL synchronously in its constructor and lets them override code options; both are
 * hidden from this process's environment for that synchronous call only (restored right after;
 * the parent shell is never affected). Their effect is already part of resolveWatchPolling.
 */
function watchWithOurSettings(cwd: string, options: Parameters<typeof chokidarWatch>[1]): FSWatcher {
  const saved: Array<[string, string]> = [];
  for (const name of ['CHOKIDAR_USEPOLLING', 'CHOKIDAR_INTERVAL']) {
    const value = process.env[name];
    if (value !== undefined) {
      saved.push([name, value]);
      delete process.env[name];
    }
  }
  try {
    return chokidarWatch(cwd, options);
  } finally {
    for (const [name, value] of saved) process.env[name] = value;
  }
}

/** A block's examples: `components/<name>/<name>.example.md`. */
function isExampleFile(relative: string): boolean {
  const match = /^components\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\.example\.md$/.exec(relative);
  return match !== null && match[1] === match[2];
}

/** Whether a cwd-relative posix path is watched code (no dot segments, served extension) or a block example. */
export function isCodeFile(relative: string): boolean {
  const segments = relative.split('/');
  if (segments.length < 2 || !(CODE_DIRECTORIES as readonly string[]).includes(segments[0])) return false;
  if (segments.some((segment) => segment === '' || segment.startsWith('.'))) return false;
  return CODE_EXTENSIONS.includes(path.posix.extname(relative)) || isExampleFile(relative);
}

export function createCodeWatcher({
  cwd,
  onChange,
  onError = () => {},
  usePolling,
  pollingIntervalMs = DEFAULT_CODE_POLLING_INTERVAL_MS,
  eventDelayMs = 50,
}: CodeWatcherOptions): CodeWatcher {
  const known = new Map<string, string>(); // relative -> SHA-256
  const pending = new Set<string>();
  let watcher: FSWatcher | null = null;
  let stopped = false;
  let ready = false;
  let timer: NodeJS.Timeout | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const relativeOf = (absolute: string): string => path.relative(cwd, absolute).split(path.sep).join('/');

  // Only the code roots, no dot segments; files must have a served extension.
  // Chokidar may ask first without stats: a path is kept unless its name alone rules it out.
  function ignored(absolute: string, stats?: { isFile(): boolean }): boolean {
    const relative = relativeOf(absolute);
    if (relative === '') return false;
    if (relative.startsWith('..') || path.isAbsolute(relative)) return true;
    const segments = relative.split('/');
    if (!(CODE_DIRECTORIES as readonly string[]).includes(segments[0])) return true;
    if (segments.some((segment) => segment.startsWith('.'))) return true;
    if (stats?.isFile()) return !isCodeFile(relative);
    return false;
  }

  async function digestOf(relative: string): Promise<string | null> {
    try {
      return createHash('sha256')
        .update(await readFile(path.join(cwd, ...relative.split('/'))))
        .digest('hex');
    } catch {
      return null; // gone (or unreadable): reported as removed if it was known
    }
  }

  async function compare(files: string[]): Promise<string[]> {
    const changed: string[] = [];
    for (const file of files) {
      const next = await digestOf(file);
      if (next === null) {
        if (known.delete(file)) changed.push(file);
      } else if (next !== known.get(file)) {
        known.set(file, next);
        changed.push(file);
      }
    }
    return changed.sort();
  }

  // Batches are compared one after another, so `known` is never updated concurrently.
  function flush(): Promise<string[]> {
    const run = queue.then(async () => {
      const files = [...pending];
      pending.clear();
      const changed = await compare(files);
      if (changed.length && ready && !stopped) onChange(changed);
      return changed;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  function schedule(): void {
    if (!ready || stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush().catch(onError);
    }, eventDelayMs);
  }

  function note(absolute: string): void {
    const relative = relativeOf(absolute);
    if (!isCodeFile(relative)) return;
    pending.add(relative);
    schedule();
  }

  function noteDirectoryRemoved(absolute: string): void {
    const prefix = `${relativeOf(absolute)}/`;
    for (const file of known.keys()) if (file.startsWith(prefix)) pending.add(file);
    schedule();
  }

  return {
    async start() {
      // The code root itself is watched (everything outside the three roots is ignored without
      // descending), so a root created later, or removed and recreated, is picked up.
      watcher = watchWithOurSettings(cwd, {
        ignored,
        ignoreInitial: false,
        persistent: true,
        // 'polling': Chokidar's stat scheduler; 'auto': fs.watch (recursive on macOS/Windows,
        // per directory elsewhere). `atomic` stays at Chokidar's default (off with polling): an
        // editor's tmp + rename arrives as unlink + add of the same path within one batch, and
        // the content hash reports it once.
        backend: usePolling ? 'polling' : 'auto',
        pollingInterval: pollingIntervalMs,
        pollingBinaryInterval: pollingIntervalMs,
      });
      watcher.on('add', note).on('change', note).on('unlink', note).on('unlinkDir', noteDirectoryRemoved);
      watcher.on('error', (error) =>
        onError(Object.assign(new Error(`code watcher: ${(error as Error)?.message ?? error}`), { cause: error })),
      );
      await new Promise<void>((resolve) => watcher!.once('ready', () => resolve()));
      await compare([...pending]); // the baseline: nothing is reported for files present at start
      pending.clear();
      ready = true;
    },
    async rescan() {
      for (const file of known.keys()) pending.add(file);
      for (const [dir, names] of Object.entries(watcher?.getWatched() ?? {})) {
        for (const name of names) {
          const relative = relativeOf(path.join(dir, name));
          if (isCodeFile(relative)) pending.add(relative);
        }
      }
      return flush();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const w = watcher;
      watcher = null;
      if (w) await w.close();
      await queue;
    },
    backend: () => watcher?.options.backend ?? null,
  };
}

/**
 * The code watcher of `dev --watch` (local and remote mode): decides polling vs native events
 * (resolveWatchPolling, `polling` = the CLI flag), logs the decision and what it overrode, and
 * creates the watcher. `log` receives one line without the command tag.
 */
export function createLiveCodeWatcher({
  polling,
  log,
  ...options
}: Omit<CodeWatcherOptions, 'usePolling'> & { polling?: boolean; log: (line: string) => void }): CodeWatcher {
  const mode = resolveWatchPolling(polling === undefined ? {} : { option: polling });
  if (mode.invalid !== undefined) log(`FOLIWAKE_WATCH_POLLING=${mode.invalid} is not 1/0/true/false/yes/no; ignored`);
  log(`code watching: ${mode.description}`);
  if (process.env.CHOKIDAR_INTERVAL !== undefined)
    log(
      `CHOKIDAR_INTERVAL is ignored: code polling runs every ` +
        `${options.pollingIntervalMs ?? DEFAULT_CODE_POLLING_INTERVAL_MS} ms`,
    );
  return createCodeWatcher({ ...options, usePolling: mode.usePolling });
}
