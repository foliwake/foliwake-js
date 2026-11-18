// `foliwake dev --remote [preview|live]`: reads ./foliwake.remote.json (or --remote-url) and the named
// password variable only, starts the dev server and says where it is.
import {
  RemoteConfigError,
  type RemoteTarget,
  readRemoteCredential,
  redactor,
  resolveRemoteTarget,
} from './remote-config.js';
import { type LiveReloadOptions, type RemoteDevServer, startRemoteDevServer } from './remote-dev.js';
import { type OnStop, closed } from './signal-stop.js';

export const DEFAULT_PORT = 3000;

/** A refused command line or configuration: printed as it is, exit 2. */
export class UsageError extends Error {}

export interface RemoteDevOptions {
  remote: 'preview' | 'live';
  port?: number | undefined;
  watch?: boolean | undefined;
  polling?: boolean | undefined;
  remoteUrl?: string | undefined;
  remoteConfig?: string | undefined;
  remoteAuthEnv?: string | undefined;
  remoteAuthUser?: string | undefined;
}

function liveReloadOf({ watch, polling }: RemoteDevOptions): boolean | LiveReloadOptions {
  if (watch !== true) return false;
  return polling === undefined ? true : { polling };
}

const defined = <T>(name: string, value: T | undefined) => (value === undefined ? {} : { [name]: value });

function targetOf(options: RemoteDevOptions, cwd: string): Promise<RemoteTarget> {
  const selection = {
    channel: options.remote,
    ...defined('url', options.remoteUrl),
    ...defined('configFile', options.remoteConfig),
    ...defined('authEnv', options.remoteAuthEnv),
    ...defined('authUser', options.remoteAuthUser),
  };
  return resolveRemoteTarget(selection, cwd);
}

/** The target and its credential; a configuration problem is a UsageError. */
async function configured(options: RemoteDevOptions, cwd: string) {
  try {
    const target = await targetOf(options, cwd);
    return { target, credential: readRemoteCredential(target, process.env) };
  } catch (error) {
    if (error instanceof RemoteConfigError) throw new UsageError(error.message);
    throw error;
  }
}

function portOf(server: RemoteDevServer): number {
  const address = server.address();
  return address && typeof address === 'object' ? address.port : 0;
}

const WATCHING =
  'Watching components/, scripts/ and styles/; open pages reload after changes and fetch the current remote ' +
  'page. The remote site is never polled. Press Ctrl+C to stop.';
const NOT_WATCHING =
  'Refresh the browser to see code edits and the current remote content (or start with --watch). ' +
  'Press Ctrl+C to stop.';

function startLines(target: RemoteTarget, cwd: string, port: number, watching: boolean): string[] {
  const auth = target.auth
    ? `user "${target.auth.username}", password from $${target.auth.passwordEnv}`
    : 'no credentials';
  const base = `http://127.0.0.1:${port}`;
  return [
    `Remote ${target.channel}: ${target.origin}  (${target.from}; ${auth})`,
    `Local code: ${cwd}/components, scripts, styles`,
    `Open ${base}/  (diagnostics: ${base}/_dev/diagnostics; the block catalog needs the engine)`,
    watching ? WATCHING : NOT_WATCHING,
  ];
}

type StartOptions = Parameters<typeof startRemoteDevServer>[0];

async function listen(options: StartOptions): Promise<RemoteDevServer> {
  try {
    return await startRemoteDevServer(options);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EADDRINUSE') throw error;
    throw new UsageError(`Port ${options.port} is already in use. Stop the other process or pass --port <n>.`);
  }
}

/** Starts remote mode and prints where it is; `onStop` gets what Ctrl+C runs. */
export async function startRemoteDev(
  options: RemoteDevOptions,
  log: (line: string) => void,
  onStop: OnStop,
): Promise<RemoteDevServer> {
  const cwd = process.cwd();
  const { target, credential } = await configured(options, cwd);
  const liveReload = liveReloadOf(options);
  const port = options.port ?? DEFAULT_PORT;
  const redact = redactor(credential.secrets);
  const server = await listen({ cwd, port, target, authorization: credential.authorization, redact, liveReload });
  for (const line of startLines(target, cwd, portOf(server), liveReload !== false)) log(line);
  onStop(() => closed(server));
  return server;
}
