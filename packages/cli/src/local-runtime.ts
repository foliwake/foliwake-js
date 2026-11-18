// The engine's hook. The Foliwake engine (a checkout or its Docker image) is the same `foliwake` command with
// this package as an oclif plugin: before oclif loads the commands, it registers its local runtime here.
// Then every core command also runs on this computer (`--config`, `$FOLIWAKE_CONFIG`, a folder with
// foliwake.config.json), and the engine serves `dev` (local content, and its own --remote). Without a
// registration, local flags answer "needs the Foliwake engine" and every command calls a server.
//
// Imported by the engine as `@foliwake/cli/local-runtime`, alone: nothing else of this package may load before
// the registration (command flags read it when their module loads).
import type { CoreCaller, CoreError } from '@foliwake/core-contract';

/** What a command opens the local runtime with. */
export interface LocalCoreOptions {
  /** `--config`, else undefined: the engine's default ($FOLIWAKE_CONFIG, then ./foliwake.config.json). */
  config: string | undefined;
  /** `--content`: this folder instead of the site's content sources (absolute). */
  content: string | undefined;
  debug: boolean;
}

/** The engine's core on this computer, open for one command. */
export interface LocalCore {
  core: CoreCaller;
  /** The configured sites (the default `--site` is the only one). */
  sites(): Promise<readonly { id: string }[]>;
  /** The site's settle delay, which default waits start from. */
  settleDelayMs(site: string): Promise<number>;
  /** Removes a state lock left by a process that is gone; the line to print. */
  breakLock(site: string): Promise<string>;
  /** Takes no new work and waits for what runs. */
  close(): Promise<void>;
}

/** `foliwake dev --remote`, served by the engine. */
export interface LocalDevRemote {
  target: 'preview' | 'live';
  url: string | undefined;
  config: string | undefined;
  authEnv: string | undefined;
  authUser: string | undefined;
}

/** `foliwake dev`: local content, or with `remote` the deployed site's. */
export interface LocalDevOptions {
  port: number | undefined;
  watch: boolean | undefined;
  polling: boolean | undefined;
  content: string | undefined;
  config: string | undefined;
  site: string | undefined;
  remote: LocalDevRemote | undefined;
}

export interface LocalDevIo {
  log(line: string): void;
  warn(line: string): void;
}

export interface TimedOptions {
  requested: boolean;
  json: boolean;
}

/** What the engine gives this CLI. */
export interface LocalRuntime {
  /** True when this folder has a local configuration (./foliwake.config.json). */
  folderConfig(cwd: string): boolean;
  open(options: LocalCoreOptions): LocalCore;
  /** Anything a command threw, as core's error and its cause (the engine knows its own failures). */
  failure(error: unknown): Promise<{ coreError: CoreError; cause: unknown }>;
  /** Phase timings of a command (`--timings`, FOLIWAKE_TIMINGS); also for calls to a server. */
  timed<T>(name: string, options: TimedOptions, fn: () => Promise<T>): Promise<T>;
  /** The command as the entry of its trace (OTEL_EXPORTER_OTLP_ENDPOINT). */
  traced<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /**
   * Serves `dev` until Ctrl+C or SIGTERM stops it (the engine stops it, as its other servers); prints its own
   * errors. Resolves to the exit code: 0, 1 (failed), 2 (a refused command line).
   */
  dev(options: LocalDevOptions, io: LocalDevIo): Promise<number>;
}

// One registration per process, also when two copies of this module are loaded (a symlinked plugin).
const KEY = Symbol.for('@foliwake/cli/local-runtime');
const slot = globalThis as { [KEY]?: LocalRuntime };

/** Called by the engine before oclif loads the commands. */
export function registerLocalRuntime(runtime: LocalRuntime): void {
  slot[KEY] = runtime;
}

/** The engine's runtime, or null in the CLI alone. */
export function localRuntime(): LocalRuntime | null {
  return slot[KEY] ?? null;
}
