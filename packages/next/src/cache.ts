// @foliwake/next/cache: the cached live envelope read (design §6.5). Primitive input only (`path`); the site is
// the configured one and the channel is live. Kept: a body (200) and "not found" (404); anything else throws
// and is not stored. Needs @foliwake/next in transpilePackages (withFoliwake adds it): Next compiles
// 'use cache' only in code it transpiles.
import 'server-only';
import { cacheLife, cacheTag } from 'next/cache.js';
import type { FoliwakeAppConfig } from '@foliwake/server/config';
import { FoliwakePageError, readEnvelope, type PageEnvelope } from '@foliwake/server/page';
import { entryLifetime, type CachedEnvelope } from './generation-floor.js';
import { foliwakeConfig, foliwakeTags, originClient } from './server.js';

export {
  setGenerationFloor,
  BEHIND_FLOOR_LIFETIME,
  type CachedEnvelope,
  type EntryLifetime,
  type GenerationFloor,
} from './generation-floor.js';

async function readEntry(config: FoliwakeAppConfig, path: string): Promise<CachedEnvelope> {
  try {
    return { found: true, envelope: await readEnvelope(config, originClient(), config.site, 'live', path) };
  } catch (error) {
    if (error instanceof FoliwakePageError && error.kind === 'not_found') return { found: false, path };
    throw error;
  }
}

/**
 * The cached entry itself (`'use cache'`, tags of `foliwakeTags('live', path)`); readEnvelopeCached unwraps it.
 * It lives `app.revalidate` seconds, or 15 seconds when its generation is below the floor of
 * `setGenerationFloor`.
 */
export async function readEnvelopeCachedEntry(path: string): Promise<CachedEnvelope> {
  'use cache';
  const config = foliwakeConfig();
  cacheTag(...foliwakeTags('live', path));
  const entry = await readEntry(config, path);
  cacheLife(await entryLifetime(entry, config.app?.revalidate ?? 300));
  return entry;
}

/** The live envelope of `path` from Next's cache (stale-while-revalidate); 404 → FoliwakePageError('not_found'). */
export async function readEnvelopeCached(path: string): Promise<PageEnvelope> {
  const entry = await readEnvelopeCachedEntry(path);
  if (!entry.found) throw new FoliwakePageError('not_found', `${path} does not exist on the live site.`, { status: 404 });
  return entry.envelope;
}
