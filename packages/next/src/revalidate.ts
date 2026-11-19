// @foliwake/next/revalidate: the route handler a Foliwake server calls once a change is live and its caches are
// refreshed. It checks the signature, expires the live tags of the changed pages (or of the whole site) and
// answers; the next request of each page reads it again.
import 'server-only';
import { revalidateTag } from 'next/cache.js';
import { after } from 'next/server.js';
import type { FoliwakeDeliveryPayload } from '@foliwake/server/hook';
import { checkEnvName } from '@foliwake/server/config';
import { readEnvelopeCachedEntry } from './cache.js';
import { createHookEndpoint } from '@foliwake/server/hook-endpoint';
import { foliwakeConfig, foliwakeTags } from './server.js';
import { SDK } from './version.js';

export type { FoliwakeDeliveryPayload, FoliwakeHookPayload, FoliwakeOperationKind } from '@foliwake/server/hook';

/** Options of `foliwakeRevalidateHandler`. */
export interface FoliwakeRevalidateOptions {
  /** The environment variable holding the shared secret (the one the Foliwake server signs with). */
  secretEnv: string;
  /** While the secret is rotated: the variable holding the previous secret, also accepted. */
  previousSecretEnv?: string;
  /**
   * `expire` (default): `revalidateTag(tag, { expire: 0 })`, the next request waits for a fresh read and never
   * sees the old page; the server sends the hook only after its caches serve the new page. `max`:
   * `revalidateTag(tag, 'max')`, the next request gets the old page once while it is read again in the background.
   */
  mode?: 'expire' | 'max';
  /**
   * Read the changed pages again right after the response (at most 20, never when every page changed), so the
   * first visitor of this region finds them cached. Default true.
   */
  warm?: boolean;
  /** Called for every delivery after its tags are expired (a log, a metric, the generation floor); a throw
   * answers 500 and the server sends the delivery again. */
  onDelivery?: (payload: FoliwakeDeliveryPayload) => void | Promise<void>;
  /** The allowed clock distance of the signature, in seconds. Default 300. */
  toleranceS?: number;
}

/** The route module exports of the hook: `export const { POST } = foliwakeRevalidateHandler(…)`. */
export interface FoliwakeHookRoute {
  POST: (request: Request) => Promise<Response>;
}

function checkOptions(opts: FoliwakeRevalidateOptions): void {
  if (!opts || typeof opts.secretEnv !== 'string') {
    throw new TypeError("Pass { secretEnv: '<the variable holding the hook secret>' }.");
  }
  checkEnvName(opts.secretEnv, 'secretEnv');
  if (opts.previousSecretEnv !== undefined) checkEnvName(opts.previousSecretEnv, 'previousSecretEnv');
  if (opts.mode !== undefined && opts.mode !== 'expire' && opts.mode !== 'max') {
    throw new TypeError("mode is 'expire' or 'max'.");
  }
}

function expireWith(mode: 'expire' | 'max'): (tag: string) => void {
  if (mode === 'max') return (tag) => revalidateTag(tag, 'max');
  return (tag) => revalidateTag(tag, { expire: 0 });
}

function liveTag(path?: string): string {
  return foliwakeTags('live', path).at(-1)!;
}

/**
 * The route handler of the Foliwake hook, for `app/api/webhooks/foliwake/route.ts`:
 * `export const { POST } = foliwakeRevalidateHandler({ secretEnv: 'FOLIWAKE_HOOK_SECRET' })`.
 * A delivery expires `foliwake:<site>:live:page:<path>` of every listed path (pages and other files alike, such
 * as an index), or `foliwake:<site>:live` when every page changed, and answers `{ ok: true, revalidated }`.
 * A `ping` answers `{ ok: true, site, sdk }` and expires nothing. 401: bad or expired signature; 400: not a
 * payload, or another site; 413: over 64 KiB.
 *
 * @param opts - `secretEnv` (required), `previousSecretEnv`, `mode`, `warm`, `onDelivery`, `toleranceS`.
 */
export function foliwakeRevalidateHandler(opts: FoliwakeRevalidateOptions): FoliwakeHookRoute {
  checkOptions(opts);
  let handler: ((request: Request) => Promise<Response>) | null = null;
  const POST = (request: Request) => {
    handler ??= createHookEndpoint({
      site: foliwakeConfig().site,
      sdk: SDK,
      secrets: () => [process.env[opts.secretEnv], opts.previousSecretEnv && process.env[opts.previousSecretEnv]],
      liveTag,
      expire: expireWith(opts.mode ?? 'expire'),
      warm: (path) => readEnvelopeCachedEntry(path),
      schedule: (task) => after(task),
      warmPages: opts.warm ?? true,
      onDelivery: opts.onDelivery,
      toleranceS: opts.toleranceS,
      log: console,
    });
    return handler(request);
  };
  return { POST };
}
