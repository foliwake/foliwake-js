// The generation floor (no Next imports, so tests run it directly): the lowest live generation the app accepts
// to keep for the full lifetime. The app registers how to read it; the cached read asks it on a miss or a
// refresh only, never on a cache hit.
import type { PageEnvelope } from '@foliwake/blocks-contract/page';

/** The highest live generation the app was told for a site, or null when it knows none. */
export type GenerationFloor = (site: string) => Promise<number | null>;

/** A cache lifetime as `cacheLife` takes it, in seconds. */
export interface EntryLifetime {
  stale: number;
  revalidate: number;
  expire: number;
}

/** What the cache stores: an envelope, or the fact that the page does not exist. */
export type CachedEnvelope = { found: true; envelope: PageEnvelope } | { found: false; path: string };

/** The lifetime of an answer older than the floor: shown at most 15 s, then read again. */
export const BEHIND_FLOOR_LIFETIME: EntryLifetime = Object.freeze({ stale: 1, revalidate: 1, expire: 15 });

const LONGEST_EXPIRE = 86_400;

// On globalThis, so a second copy of this module in a bundle sees the same registration.
const KEY = Symbol.for('@foliwake/next.generationFloor');
type Registry = { [KEY]?: GenerationFloor | null };

/**
 * Registers how the cached read learns the generation floor (for example a database row the hook's `onDelivery`
 * writes). A cached answer with an older `X-Site-Generation` is kept at most 15 seconds instead of
 * `app.revalidate`. Call it at module scope of a module that every route reading pages imports; `null` removes it.
 *
 * @param floor - `(site) => Promise<number | null>`; a throw turns the check off for that read (logged).
 */
export function setGenerationFloor(floor: GenerationFloor | null): void {
  (globalThis as Registry)[KEY] = floor;
}

function registered(): GenerationFloor | null {
  return (globalThis as Registry)[KEY] ?? null;
}

async function floorOf(read: GenerationFloor, site: string, log: Pick<Console, 'warn'>): Promise<number | null> {
  try {
    return await read(site);
  } catch (error) {
    log.warn(`[foliwake] the generation floor of ${site} could not be read; the read is not checked`, error);
    return null;
  }
}

/**
 * Whether an envelope is older than the registered floor. No floor, no generation on the answer, or a floor
 * that cannot be read: false (fail-open).
 */
export async function behindFloor(envelope: PageEnvelope, log: Pick<Console, 'warn'> = console): Promise<boolean> {
  const read = registered();
  if (read === null) return false;
  const floor = await floorOf(read, envelope.site, log);
  if (floor === null) return false;
  if (envelope.generation === null) {
    log.warn(`[foliwake] ${envelope.path} came without X-Site-Generation; the floor is not checked`);
    return false;
  }
  if (envelope.generation >= floor) return false;
  log.warn(`[foliwake] ${envelope.path} is at generation ${envelope.generation}, below ${floor}; kept 15 s`);
  return true;
}

/** The lifetime of a cache entry: `revalidate` seconds, or BEHIND_FLOOR_LIFETIME for an answer below the floor. */
export async function entryLifetime(entry: CachedEnvelope, revalidate: number): Promise<EntryLifetime> {
  if (entry.found && (await behindFloor(entry.envelope))) return BEHIND_FLOOR_LIFETIME;
  return { stale: revalidate, revalidate, expire: LONGEST_EXPIRE };
}
