// @foliwake/next/cache: the cached live envelope read (design §6.5). Primitive input only (`path`); the site is
// the configured one and the channel is live. Kept: a body (200) and "not found" (404); anything else throws
// and is not stored. Needs @foliwake/next in transpilePackages (withFoliwake adds it): Next compiles
// 'use cache' only in code it transpiles.
import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import type { PageEnvelope } from '@foliwake/blocks-contract/page';
import { FoliwakePageError, readEnvelope } from '@foliwake/server/page';
import { foliwakeConfig, foliwakeTags, originClient } from './server.js';

/** What the cache stores: an envelope, or the fact that the page does not exist. */
export type CachedEnvelope = { found: true; envelope: PageEnvelope } | { found: false; path: string };

/** The cached entry itself (`'use cache'`, tags of `foliwakeTags('live', path)`); readEnvelopeCached unwraps it. */
export async function readEnvelopeCachedEntry(path: string): Promise<CachedEnvelope> {
  'use cache';
  const config = foliwakeConfig();
  const revalidate = config.app?.revalidate ?? 300;
  cacheLife({ stale: revalidate, revalidate, expire: 86_400 });
  cacheTag(...foliwakeTags('live', path));
  try {
    return { found: true, envelope: await readEnvelope(config, originClient(), config.site, 'live', path) };
  } catch (error) {
    if (error instanceof FoliwakePageError && error.kind === 'not_found') return { found: false, path };
    throw error;
  }
}

/** The live envelope of `path` from Next's cache (stale-while-revalidate); 404 → FoliwakePageError('not_found'). */
export async function readEnvelopeCached(path: string): Promise<PageEnvelope> {
  const entry = await readEnvelopeCachedEntry(path);
  if (!entry.found) throw new FoliwakePageError('not_found', `${path} does not exist on the live site.`, { status: 404 });
  return entry.envelope;
}
