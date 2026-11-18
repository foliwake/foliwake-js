// The terminal questions of `create`'s connect step and of `site create|link`: which server, and which site.
import type { Readable, Writable } from 'node:stream';

import { isCancel, select, text } from '@clack/prompts';

export interface PromptStreams {
  input: Readable;
  output: Writable;
}

/** A server to offer: signed in to, signed out of, or Foliwake Cloud. */
export interface ServerEntry {
  origin: string;
  signedIn: boolean;
  /** The signed-in account's e-mail address, when known. */
  account: string | null;
  lastUsed: boolean;
  /** Shown instead of the origin (Foliwake Cloud: "Foliwake Cloud (cloud)"). */
  title?: string;
}

/** Offered as "Another server…" when no server of one's own is known. */
export const DEFAULT_NEW_SERVER = 'http://localhost:8080';

const OTHER = '\0other';
const NOT_NOW = '\0no';

/** A server in a list: its title or origin, then its account and "last used", or "sign in". */
export function serverChoiceLabel(server: ServerEntry): string {
  const signedNotes = [server.account, server.lastUsed ? 'last used' : null].filter(Boolean).join(' · ');
  const notes = server.signedIn ? signedNotes : 'sign in';
  const name = server.title ?? server.origin;
  return notes ? `${name} — ${notes}` : name;
}

function addressCheck(origin: (typed: string) => string, fallback: string | undefined) {
  return (value: string | undefined): string | undefined => {
    if (!value) return fallback ? undefined : 'Give the server address, e.g. https://foliwake.example';
    try {
      origin(value);
      return undefined;
    } catch (error) {
      return (error as Error).message;
    }
  };
}

async function askAddress(io: PromptStreams, origin: (typed: string) => string, fallback: string | undefined) {
  const typed = await text({
    ...io,
    message: 'Server address',
    placeholder: fallback ?? 'https://foliwake.example',
    ...(fallback ? { defaultValue: fallback } : {}),
    validate: addressCheck(origin, fallback),
  });
  if (isCancel(typed)) return null;
  return origin(typed || (fallback as string));
}

/**
 * Which server: each server signed in to, those signed out of and Foliwake Cloud ("sign in"), "Another
 * server…" (an address) and "Not now". Null: not now, or cancelled. `origin` checks an address.
 */
export async function askServer(
  io: PromptStreams,
  servers: readonly ServerEntry[],
  origin: (typed: string) => string,
  { message = 'Connect to a Foliwake server?', allowOther = true }: { message?: string; allowOther?: boolean } = {},
): Promise<string | null> {
  const own = servers.filter((server) => server.signedIn || !server.title);
  const fallback = own.length ? undefined : DEFAULT_NEW_SERVER;
  const options: Array<{ value: string; label: string; hint?: string }> = servers.map((server) => ({
    value: server.origin,
    label: serverChoiceLabel(server),
  }));
  if (allowOther) options.push({ value: OTHER, label: 'Another server…', ...(fallback ? { hint: fallback } : {}) });
  options.push({ value: NOT_NOW, label: 'Not now' });
  const initial = servers.find((s) => s.lastUsed) ?? servers.find((s) => s.signedIn) ?? own[0];
  const initialValue = initial?.origin ?? (allowOther ? OTHER : NOT_NOW);
  const choice = await select<string>({ ...io, message, initialValue, options });
  if (isCancel(choice) || choice === NOT_NOW) return null;
  if (choice !== OTHER) return choice;
  return askAddress(io, origin, fallback);
}

/** After the server is chosen and signed in to: a new site (admins only), an existing one, or not now. */
export async function askConnect(
  io: PromptStreams,
  { server, site, mayCreate, sites }: { server: string; site: string; mayCreate: boolean; sites: readonly string[] },
): Promise<{ create: string } | { link: string } | null> {
  const options: Array<{ value: string; label: string; hint?: string }> = [];
  if (mayCreate) options.push({ value: 'create', label: `Create a new site "${site}"` });
  if (sites.length)
    options.push({ value: 'link', label: 'Link an existing site', hint: `${sites.length} you may develop` });
  options.push({ value: 'no', label: 'Not now' });
  const choice = await select<string>({ ...io, message: `Site on ${server}`, initialValue: options[0].value, options });
  if (isCancel(choice) || choice === 'no') return null;
  if (choice === 'create') return { create: site };
  const sitesList = sites.map((id) => ({ value: id, label: id }));
  const picked = await select<string>({ ...io, message: 'Which site?', options: sitesList });
  return isCancel(picked) ? null : { link: picked };
}
