// `foliwake dev --remote`: which deployed site supplies the content, and the
// credential used for it.
//
// The endpoints and the NAMES of the environment variables that hold
// passwords come from a committed, secret-free `foliwake.remote.json` in the
// frontend repository (or from --remote-url / --remote-auth-env /
// --remote-auth-user). The password itself is read from the environment once,
// at start, and stays in the dev server process: it is never printed, logged,
// written to a file or sent to the browser. Every message passes through
// redactor() as a second line of defence.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CONFIG_ENV,
  FoliwakeConfigError,
  checkEnvName as checkEnvNameV2,
  checkUsername,
  endpointOf,
  isLoopbackName,
  parseFoliwakeConfig,
  parseRemoteUrl,
} from '@foliwake/server/config';

// One parser for the CLI and the app packages (@foliwake/server/config, config version 2).
export { isLoopbackName, parseRemoteUrl };

export const REMOTE_CONFIG_FILE = 'foliwake.remote.json';
export const REMOTE_CHANNELS = ['preview', 'live'] as const;
export type RemoteChannel = (typeof REMOTE_CHANNELS)[number];

/** HTTP Basic credentials: a user name and the NAME of the variable holding the password. */
export interface RemoteAuth {
  type: 'basic';
  username: string;
  passwordEnv: string;
}

/** The deployed site one dev server reads content from. */
export interface RemoteTarget {
  channel: RemoteChannel;
  /** Origin only (scheme, host, port), e.g. https://preview.foliwake.example */
  origin: string;
  auth: RemoteAuth | null;
  /** Where the endpoint came from, for messages: the file name or the option. */
  from: string;
}

/** A configuration problem; the message is shown as is (it never contains a secret). */
export const RemoteConfigError = FoliwakeConfigError;
export type RemoteConfigError = FoliwakeConfigError;

/** Validates an environment variable NAME (never a value), by the rule of @foliwake/server/config. */
export function checkEnvName(value: unknown, where: string): string {
  return checkEnvNameV2(value, where);
}

/** Why `foliwake dev --remote` cannot read with a service token, and what to use instead. */
function serviceTokenRefusal(file: string, channel: RemoteChannel): RemoteConfigError {
  return new RemoteConfigError(
    `${file} "${channel}": foliwake dev --remote reads with "basic" auth only; ` +
      '"service-token" is for an app server (@foliwake/server). ' +
      `Point --remote-config at a file whose ${channel} endpoint uses "basic", ` +
      'or pass --remote-url with --remote-auth-user and --remote-auth-env.',
  );
}

/** Parses the text of foliwake.remote.json (version 2) and returns the endpoint of `channel`. */
export function parseRemoteConfig(
  text: string,
  channel: RemoteChannel,
  file = REMOTE_CONFIG_FILE,
): { origin: string; auth: RemoteAuth | null } {
  const config = parseFoliwakeConfig(text, { file, requireApp: false });
  const { origin, auth } = endpointOf(config, channel);
  if (auth?.type === 'service-token') throw serviceTokenRefusal(file, channel);
  return { origin, auth: auth ? { ...auth } : null };
}

/** The command-line choices of remote mode. */
export interface RemoteSelection {
  channel: RemoteChannel;
  /** --remote-url: no file is read. */
  url?: string;
  /** --remote-auth-env (with --remote-auth-user). */
  authEnv?: string;
  authUser?: string;
  /** --remote-config: another endpoints file (relative to cwd). */
  configFile?: string;
}

/**
 * Resolves the target from the command line and, without --remote-url, from a config file:
 * --remote-config beats FOLIWAKE_REMOTE beats <cwd>/foliwake.remote.json.
 */
export async function resolveRemoteTarget(
  selection: RemoteSelection,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RemoteTarget> {
  const { channel } = selection;
  if (selection.url !== undefined) {
    const origin = parseRemoteUrl(selection.url, '--remote-url');
    const auth: RemoteAuth | null =
      selection.authEnv === undefined
        ? null
        : {
            type: 'basic',
            username: checkUsername(selection.authUser, '--remote-auth-user'),
            passwordEnv: checkEnvName(selection.authEnv, '--remote-auth-env'),
          };
    return { channel, origin, auth, from: '--remote-url' };
  }
  const named = selection.configFile ?? (env[CONFIG_ENV] || undefined);
  const option = selection.configFile !== undefined ? '--remote-config' : CONFIG_ENV;
  const file = path.resolve(cwd, named ?? REMOTE_CONFIG_FILE);
  const name = named ?? REMOTE_CONFIG_FILE;
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (named !== undefined) throw new RemoteConfigError(`${option}: ${file} does not exist.`);
      throw new RemoteConfigError(
        `No ${REMOTE_CONFIG_FILE} in ${cwd}. Run the command in the frontend checkout that has one, or pass ` +
          `--remote-config <file> or --remote-url <https url> (and --remote-auth-user <name> --remote-auth-env ` +
          `<NAME> for a protected site).`,
      );
    }
    throw new RemoteConfigError(`Cannot read ${name}: ${(error as Error).message}`);
  }
  const { origin, auth } = parseRemoteConfig(text, channel, name);
  return { channel, origin, auth, from: name };
}

/** The credential of a target, read from the environment: kept in memory only. */
export interface RemoteCredential {
  /** The Authorization header value, or null for an unprotected target. */
  authorization: string | null;
  /** Strings that must never appear in output (the password and its encodings). */
  secrets: string[];
}

/** Reads the password named by the target; refuses to start when it is missing or empty. */
export function readRemoteCredential(target: RemoteTarget, env: NodeJS.ProcessEnv): RemoteCredential {
  if (!target.auth) return { authorization: null, secrets: [] };
  const { username, passwordEnv } = target.auth;
  const password = env[passwordEnv];
  if (password === undefined || password === '') {
    throw new RemoteConfigError(
      `${passwordEnv} is not set. ${target.channel} at ${target.origin} needs the password of user ` +
        `"${username}" in the environment variable ${passwordEnv} ` +
        `(for example \`set -a; . <file outside Git>; set +a\`). Nothing was started; the value is never printed.`,
    );
  }
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return { authorization: `Basic ${encoded}`, secrets: [password, encoded, encodeURIComponent(password)] };
}

/** Replaces every secret (and its encodings) in a text with [redacted]. */
export function redactor(secrets: readonly string[]): (text: string) => string {
  const list = [...new Set(secrets.filter((s) => s.length > 0))].sort((a, b) => b.length - a.length);
  return (text) => {
    let out = String(text);
    for (const secret of list) out = out.split(secret).join('[redacted]');
    return out;
  };
}
