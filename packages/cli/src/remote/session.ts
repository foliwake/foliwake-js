// The sign-in of this computer to a server: its token and profile together.
import type { CoreCaller } from '@foliwake/core-contract';

import { setting } from '../settings.js';
import { type CredentialStore, credentialStore } from './credentials.js';
import { createRemoteCaller } from './remote-caller.js';
import {
  type Grant,
  readProfiles,
  serverName,
  serverOrigin,
  signInEntry,
  signInMoved,
  writeProfiles,
} from './servers.js';

/** A sign-in kept for a server name now resolving to another origin: its token is not sent. */
export class SignInMovedError extends Error {}

function originOrNull(typed: string, env: NodeJS.ProcessEnv): string | null {
  try {
    return serverOrigin(typed, env);
  } catch {
    return null;
  }
}

/**
 * `FOLIWAKE_TOKEN` belongs to `FOLIWAKE_SERVER` only: it is never sent to another server, so a CI key
 * cannot leak to whatever `--server` names. Without that pair: the stored sign-in, or none.
 */
export function tokenFor(origin: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = setting('TOKEN', env);
  const envServer = setting('SERVER', env);
  if (fromEnv && envServer && originOrNull(envServer, env) === origin) return fromEnv;
  return storedToken(origin, env);
}

/** The caller of a server with this computer's token for it; SignInMovedError rather than call without it. */
export function remoteCallerFor(origin: string, env: NodeJS.ProcessEnv = process.env): CoreCaller {
  const token = tokenFor(origin, env);
  if (token === null) {
    const moved = signInMoved(origin, env);
    if (moved) throw new SignInMovedError(moved);
  }
  return createRemoteCaller({ origin, token });
}

/** A remembered sign-in for a server, whether or not its token may be sent to `origin`: for logout. */
export function storedSignIn(
  origin: string,
  env: NodeJS.ProcessEnv = process.env,
): { key: string; issuer: string | null; token: string | null } | null {
  const entry = signInEntry(origin, env);
  if (!entry) return null;
  return { key: entry.key, issuer: entry.issuer, token: credentialStore(entry.profile.store, env).get(entry.key) };
}

type Rehomed = { kept: string } | { orphan: { issuer: string | null; token: string | null } };

/**
 * Before a new sign-in to `origin`: a sign-in kept by the same name but issued elsewhere ("cloud" moved from
 * A to B) is kept as a sign-in to A (`kept`). When that cannot be, it is handed back as `orphan` for the caller
 * to revoke at A before the new sign-in replaces it. Null: nothing to do.
 */
export function rehomeMovedSignIn(origin: string, env: NodeJS.ProcessEnv = process.env): Rehomed | null {
  const profiles = readProfiles(env);
  const entry = signInEntry(origin, env, profiles);
  if (!entry || entry.issuer === origin) return null;
  const store = credentialStore(entry.profile.store, env);
  const token = store.get(entry.key);
  const issuer = entry.issuer;
  if (issuer === null || profiles.servers[issuer] || token === null) return { orphan: { issuer, token } };
  store.set(issuer, token);
  if (store.get(issuer) !== token) return { orphan: { issuer, token } };
  store.delete(entry.key);
  profiles.servers[issuer] = { ...entry.profile, origin: issuer };
  delete profiles.servers[entry.key];
  if (profiles.default === entry.key) profiles.default = issuer;
  writeProfiles(profiles, env);
  return { kept: issuer };
}

function keepToken(store: CredentialStore, name: string, token: string, previous: string | null): void {
  store.set(name, token);
  if (store.get(name) === token) return;
  if (previous) store.set(name, previous);
  throw new Error(`The ${store.kind} did not keep the token.`);
}

export interface NewSignIn {
  origin: string;
  token: string;
  grant: Grant;
  store: CredentialStore;
  email?: string | null;
}

/**
 * Keeps a new sign-in and makes its server the default; returns the token it replaced, which the caller
 * revokes. The new token is read back first: if the store did not keep it, the earlier sign-in stays.
 */
export function saveSignIn(
  { origin, token, grant, store, email = null }: NewSignIn,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const name = serverName(origin, env);
  const profiles = readProfiles(env);
  const entry = signInEntry(origin, env, profiles);
  // The earlier token is revoked by the caller at `origin`: only when it was issued there.
  const previous = entry && entry.issuer === origin ? entry : null;
  const superseded = previous ? credentialStore(previous.profile.store, env).get(previous.key) : null;
  const sameSlot = entry !== null && entry.key === name && entry.profile.store === store.kind;
  keepToken(store, name, token, sameSlot && previous ? superseded : null);
  // Replaced: the earlier credential of this name, and a cloud sign-in still kept by its origin.
  if (entry && !sameSlot) credentialStore(entry.profile.store, env).delete(entry.key);
  if (entry && entry.key !== name) delete profiles.servers[entry.key];
  const { principal, memberships, installation } = grant;
  const signedInAt = new Date().toISOString();
  const profile = { principal, memberships, installation, signedInAt, store: store.kind, origin };
  profiles.servers[name] = { ...profile, ...(email ? { email } : {}) };
  profiles.default = name;
  profiles.signedOut = profiles.signedOut.filter((known) => known !== name);
  writeProfiles(profiles, env);
  return superseded && superseded !== token ? superseded : null;
}

/** The stored token for a server, or null: only for the origin that issued it. */
export function storedToken(origin: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const entry = signInEntry(origin, env);
  return entry && entry.issuer === origin ? credentialStore(entry.profile.store, env).get(entry.key) : null;
}

/** Forgets a sign-in on this computer (a moved one too); false when there is none. */
export function forgetSignIn(origin: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const name = serverName(origin, env);
  const profiles = readProfiles(env);
  const entry = signInEntry(origin, env, profiles);
  if (!entry) return false;
  credentialStore(entry.profile.store, env).delete(entry.key);
  delete profiles.servers[entry.key];
  if (!profiles.signedOut.includes(name)) profiles.signedOut.push(name);
  if (profiles.default === entry.key) profiles.default = Object.keys(profiles.servers)[0] ?? null;
  writeProfiles(profiles, env);
  return true;
}
