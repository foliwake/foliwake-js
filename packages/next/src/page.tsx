// <FoliwakeServerPage> and readPage: read (live: cached envelope; preview: never cached), prepare per request
// (callbacks run here, on the server, after the cache), and hand the serialisable page to the app's client
// component.
import 'server-only';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation.js';
import { preload } from 'react-dom';
import { connection } from 'next/server.js';
import type { ChannelName, FoliwakePageData, PageEnvelope } from '@foliwake/blocks-contract/page';
import { pageImportMap, preparePage, readEnvelope, type PrepareOptions } from '@foliwake/server/page';
import { preloadHints } from '@foliwake/server/preload';
import { readEnvelopeCached } from './cache.js';
import { foliwakeConfig, originClient } from './server.js';

/** Options of `readPage`: the channel, the reader, hints, and `preparePage`'s options. */
export interface ReadPageOptions extends PrepareOptions {
  /** `live` (default, cached) or `preview` (read per request, never cached). */
  channel?: ChannelName;
  /** The live envelope reader; default readEnvelopeCached (or the app's own 'use cache' wrapper). */
  read?: (path: string) => Promise<PageEnvelope>;
  /** Compute same-origin preload hints for the page's blocks into `page.preload` (default true). */
  hints?: boolean;
}

const isPageError = (error: unknown, ...kinds: string[]): boolean =>
  typeof error === 'object' && error !== null && (error as { name?: string }).name === 'FoliwakePageError' && kinds.includes((error as { kind?: string }).kind ?? '');

/** The prepared page. Preview: `connection()` first (per request, never cached). */
export async function readPage(path: string, opts: ReadPageOptions = {}): Promise<FoliwakePageData> {
  const { channel = 'live', read, hints = true, ...prepare } = opts;
  const config = foliwakeConfig();
  let envelope: PageEnvelope;
  if (channel === 'preview') {
    await connection();
    envelope = await readEnvelope(config, originClient(), config.site, 'preview', path);
  } else {
    envelope = await (read ?? readEnvelopeCached)(path);
  }
  const page = preparePage(config, envelope, prepare);
  if (hints) page.preload = await preloadHints(config, originClient(), page);
  return page;
}

/**
 * Emits the page's hints into the document head (React DOM resource APIs; deduplicated by React). Modules are
 * hinted as `preload as="script"` (the bytes, fetched in parallel), not `modulepreload`: a module preloaded
 * before the page's import map is in the document fails to resolve `@foliwake/block-kit` for good, and in a Next
 * app the hints reach <head> before the map (which renders with the page, and on a client navigation arrives later).
 */
export function emitPreloadHints(page: FoliwakePageData): void {
  for (const hint of page.preload) {
    if (hint.rel === 'modulepreload') preload(hint.href, { as: 'script', crossOrigin: 'anonymous' });
    else preload(hint.href, { as: 'style' });
  }
}

/** Props of `<FoliwakeServerPage>`. */
export interface FoliwakeServerPageProps {
  /** The site's page path (`/`, `/lessons/a`); it must match `app.pages`. */
  path: string;
  /** `live` (default, cached) or `preview` (per request, never cached; protect the route). */
  channel?: ChannelName;
  /** `preparePage` options: `rewriteLink`, `transform`, `mode`. */
  prepare?: PrepareOptions;
  /** The live envelope reader; default readEnvelopeCached. */
  read?: (path: string) => Promise<PageEnvelope>;
  /** Preload hints for the blocks (default true): modulepreload/preload links in <head>, same-origin. */
  hints?: boolean;
  /**
   * The request's CSP nonce (`foliwakeCsp({ strategy: 'nonce', nonce })`): set on the page's import map. Pass it to
   * your `<FoliwakePage nonce>` too, so a map the browser adds on a client navigation carries it.
   */
  nonce?: string;
  /** Runs on the server; returns the app's client component with the page. */
  render: (page: FoliwakePageData) => ReactNode;
}

/**
 * The import map of the page's code release (`@foliwake/block-kit` → its block-kit, scoped to the release's code
 * path), as an element to render before the page's blocks load; null for a page without a code release.
 * Browsers honour a map that arrives after the document's first module load (client navigation, a second
 * release) only with multiple import maps (Chrome 133+); `@foliwake/client` adds the same map when it is missing.
 */
export function FoliwakeImportMap({ page, nonce }: { page: FoliwakePageData; nonce?: string }): ReactNode {
  const text = pageImportMap(page);
  if (text === null) return null;
  return <script type="importmap" nonce={nonce} data-foliwake-code={page.codeBase ?? undefined} dangerouslySetInnerHTML={{ __html: text }} />;
}

/** A Foliwake page in a server component. Missing or not allowed → notFound(); other errors throw (error.tsx). */
export async function FoliwakeServerPage(props: FoliwakeServerPageProps): Promise<ReactNode> {
  let page: FoliwakePageData;
  try {
    page = await readPage(props.path, { ...(props.prepare ?? {}), ...(props.channel ? { channel: props.channel } : {}), ...(props.read ? { read: props.read } : {}), hints: props.hints ?? true });
  } catch (error) {
    if (isPageError(error, 'not_found', 'not_allowed')) notFound();
    throw error;
  }
  emitPreloadHints(page);
  return (
    <>
      <FoliwakeImportMap page={page} nonce={props.nonce} />
      {props.render(page)}
    </>
  );
}
