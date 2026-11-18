// Foliwake servers this computer is signed in to: one profile per server (by name: "cloud" for Foliwake
// Cloud, else the origin), without secrets (the token is in a credential store), and which server a command
// calls. The profiles file and the credential store are the engine CLI's own: a sign-in made with either
// CLI serves both.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { CoreOutput } from '@foliwake/core-contract';

import { COMMAND, configDir, isLoopbackHost, setting } from '../settings.js';
import { readConnection } from './connection.js';

export type Grant = CoreOutput<'whoami'>;
export type Membership = Grant['memberships'][number];

/**
 * Foliwake Cloud: the reserved server name `cloud`. The Cloud is not available yet; its origin is
 * CLOUD_ORIGIN (FOLIWAKE_CLOUD_ORIGIN overrides it, for tests or a move). A sign-in to it is kept under
 * "cloud", never by its URL.
 */
export const CLOUD = 'cloud';
export const CLOUD_ORIGIN = 'https://cloud.foliwake.org';
export const CLOUD_TITLE = 'Foliwake Cloud';
/** Said when someone names the cloud: it does not exist yet. */
export const CLOUD_NOTE =
  `${CLOUD_TITLE} is not available yet; sign in to your own Foliwake server instead, ` +
  `e.g. \`${COMMAND} login https://foliwake.example\`.`;

/** True when the cloud's origin was set for this run (FOLIWAKE_CLOUD_ORIGIN): only then may `cloud` be used. */
export function cloudConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(setting('CLOUD_ORIGIN', env));
}

export type CredentialStoreKind = 'keychain' | 'secret-service' | 'file';

export interface ServerProfile {
  principal: string;
  memberships: Membership[];
  installation: boolean;
  signedInAt: string;
  store: CredentialStoreKind;
  /** The account's e-mail address, when the server said it at sign-in. */
  email?: string | null;
  /** The origin that issued the token; its token is sent there only. Absent in old profiles kept by origin. */
  origin?: string;
}

export interface Profiles {
  /** The server (its name) commands call when nothing else names one: the last `login`. */
  default: string | null;
  servers: Record<string, ServerProfile>;
  /** Servers this computer signed out of (offered again by `create`); no secrets. */
  signedOut: string[];
}

export class ServerAddressError extends Error {}

/** The cloud's origin: FOLIWAKE_CLOUD_ORIGIN, else CLOUD_ORIGIN. */
export function cloudOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const own = setting('CLOUD_ORIGIN', env);
  return own ? plainOrigin(own) : CLOUD_ORIGIN;
}

/** A server's origin from what a person typed: "cloud", an origin, or a host meaning https. */
export function serverOrigin(typed: string, env: NodeJS.ProcessEnv = process.env): string {
  return typed.trim().toLowerCase() === CLOUD ? cloudOrigin(env) : plainOrigin(typed);
}

/** The name this computer remembers a server by: "cloud" for the cloud's origin, else the origin. */
export function serverName(origin: string, env: NodeJS.ProcessEnv = process.env): string {
  return origin === cloudOrigin(env) ? CLOUD : origin;
}

/** The origin of a remembered name ("cloud" or an origin); null for a name that is neither. */
export function nameOrigin(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    return serverOrigin(name, env);
  } catch {
    return null;
  }
}

/** How a server is printed: "cloud (https://foliwake.dev)" for the cloud, else its origin. */
export function serverDisplay(origin: string, env: NodeJS.ProcessEnv = process.env): string {
  return serverName(origin, env) === CLOUD ? `${CLOUD} (${origin})` : origin;
}

function parsedUrl(typed: string): URL {
  const text = typed.trim();
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    const example = 'give an origin such as https://foliwake.example or a host name.';
    throw new ServerAddressError(`"${typed}" is not a server address; ${example}`);
  }
}

/** Plain http only for loopback; an origin only: no path, query or credentials. */
function plainOrigin(typed: string): string {
  const url = parsedUrl(typed);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ServerAddressError(`A server address uses https; got ${url.protocol}.`);
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.host)) {
    throw new ServerAddressError('Plain http is allowed only for a loopback server (127.0.0.1, localhost); use https.');
  }
  const hasPath = url.pathname !== '/' && url.pathname !== '';
  if (url.username || url.password || hasPath || url.search || url.hash) {
    throw new ServerAddressError('A server address is an origin only: no path, query or credentials.');
  }
  return url.origin;
}

const profilesFile = (env?: NodeJS.ProcessEnv) => path.join(configDir(env), 'servers.json');

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export function readProfiles(env?: NodeJS.ProcessEnv): Profiles {
  let raw: string;
  try {
    raw = readFileSync(profilesFile(env), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { default: null, servers: {}, signedOut: [] };
    throw error;
  }
  const parsed = JSON.parse(raw) as Partial<Profiles>;
  return {
    default: typeof parsed.default === 'string' ? parsed.default : null,
    servers: parsed.servers && typeof parsed.servers === 'object' ? parsed.servers : {},
    signedOut: strings(parsed.signedOut),
  };
}

export function writeProfiles(profiles: Profiles, env?: NodeJS.ProcessEnv): void {
  const file = profilesFile(env);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(profiles, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
}

/** A remembered sign-in: its key in servers.json and the credential store, its profile, its token's issuer. */
export interface SignInEntry {
  key: string;
  profile: ServerProfile;
  /** null: unknown (a "cloud" profile without its origin), so its token is never sent. */
  issuer: string | null;
}

/** The origin that issued a profile's token: recorded, else its key when that is an origin. */
export function issuerOf(key: string, profile: ServerProfile): string | null {
  if (typeof profile.origin === 'string') return profile.origin;
  return key === CLOUD ? null : key;
}

/** The sign-in remembered for a server (by its origin), whether or not it may be used there. */
export function signInEntry(
  origin: string,
  env: NodeJS.ProcessEnv = process.env,
  profiles: Profiles = readProfiles(env),
): SignInEntry | null {
  const name = serverName(origin, env);
  const keptByOrigin = name === CLOUD && profiles.servers[origin];
  const key = profiles.servers[name] ? name : keptByOrigin ? origin : null;
  return key === null ? null : { key, profile: profiles.servers[key], issuer: issuerOf(key, profiles.servers[key]) };
}

/** The profile of a server (by its origin) when its token was issued there, or null. */
export function profileOf(origin: string, env: NodeJS.ProcessEnv = process.env): ServerProfile | null {
  const entry = signInEntry(origin, env);
  return entry && entry.issuer === origin ? entry.profile : null;
}

/** Why the sign-in kept for this origin may not be used there (issued by another origin); null otherwise. */
export function signInMoved(origin: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const entry = signInEntry(origin, env);
  if (!entry || entry.issuer === origin) return null;
  const now = setting('CLOUD_ORIGIN', env) ? ' (FOLIWAKE_CLOUD_ORIGIN)' : '';
  const login = `${COMMAND} login ${entry.key === CLOUD ? CLOUD : origin}`;
  return (
    `This computer's sign-in to ${entry.key} was made at ${entry.issuer ?? 'an unknown address'}, ` +
    `but ${entry.key} now means ${origin}${now}; its token is not sent there. Sign in to ${origin}: \`${login}\`.`
  );
}

/** Makes a signed-in server the default; false when this computer is not signed in to it. */
export function useServer(origin: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const profiles = readProfiles(env);
  const entry = signInEntry(origin, env, profiles);
  if (!entry || entry.issuer !== origin) return false;
  profiles.default = entry.key;
  writeProfiles(profiles, env);
  return true;
}

/** The origin of the default server (the last `login`), or null. */
export function defaultOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const name = readProfiles(env).default;
  return name ? nameOrigin(name, env) : null;
}

/** The server a command calls, and what named it. */
export interface Target {
  origin: string;
  from: 'flag' | 'connection' | 'environment' | 'login';
}

/**
 * `--server`, then the folder's `.foliwake/connection.json`, then `FOLIWAKE_SERVER`, then the last `login`.
 * Null: nothing names a server. Unlike the engine's CLI, nothing here is local: FOLIWAKE_CONFIG and
 * foliwake.config.json are not read.
 */
export function resolveTarget(
  { server }: { server?: string | undefined },
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Target | null {
  if (server !== undefined) return { origin: serverOrigin(server, env), from: 'flag' };
  const connection = readConnection(cwd);
  if (connection) return { origin: serverOrigin(connection.server, env), from: 'connection' };
  const fromEnv = setting('SERVER', env);
  if (fromEnv) return { origin: serverOrigin(fromEnv, env), from: 'environment' };
  const fallback = defaultOrigin(env);
  return fallback ? { origin: fallback, from: 'login' } : null;
}
