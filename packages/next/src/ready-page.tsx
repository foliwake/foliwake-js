// @foliwake/next/page: a ready page route. At the app's root, `app/[...path]/page.tsx`:
//
//   export { default, generateMetadata } from '@foliwake/next/page';
//
// The app's own routes win over the catch-all; `/` stays the app's. Customise with createFoliwakePage: the render
// (host members, events), preview with an author check, a mount such as `/pages`.
import 'server-only';
import { Suspense, cache, type ReactNode } from 'react';
import { notFound } from 'next/navigation.js';
import type { ChannelName, FoliwakePageData } from '@foliwake/blocks-contract/page';
import type { PrepareOptions } from '@foliwake/server/page';
import { FoliwakePage } from './client.js';
import { emitPreloadHints, FoliwakeImportMap, readPage } from './page.js';
import {
  checkMount,
  checkPageChannel,
  metadataOf,
  mountRewriter,
  pagePathOf,
  readOrNull,
  type PageMetadata,
} from './page-route.js';

/** The route's props: Next's params of a catch-all segment `[...path]` or `[[...path]]`. */
export interface FoliwakeRouteProps {
  params: Promise<{ path?: string[] }>;
}

/** Options of `createFoliwakePage`. */
export interface FoliwakePageOptions {
  /** Returns the app's component for the page; default `<FoliwakePage page={page} as="article" />`. */
  render?: (page: FoliwakePageData) => ReactNode;
  /** `preparePage` options; `rewriteLink` defaults to the mount's. */
  prepare?: PrepareOptions;
  /** `live` (default, cached) or `preview` (per request; needs `authorize`). */
  channel?: ChannelName;
  /** The app's author check (cookies(), headers(), its session); false → not found. Required for preview. */
  authorize?: () => boolean | Promise<boolean>;
  /** The app path the route is mounted at, such as `/pages`; default the root. */
  mount?: string;
  /** The Suspense fallback while the page is read; default none. */
  fallback?: ReactNode;
}

/** A page route component with its `generateMetadata`. */
export type FoliwakeRoute = ((props: FoliwakeRouteProps) => ReactNode) & {
  generateMetadata: (props: FoliwakeRouteProps) => Promise<PageMetadata>;
};

const defaultRender = (page: FoliwakePageData): ReactNode => <FoliwakePage page={page} as="article" />;

/** Reads one page per request and path (React cache: the render and generateMetadata share it). */
function pageReader(opts: FoliwakePageOptions, channel: ChannelName) {
  const rewriteLink = mountRewriter(checkMount(opts.mount));
  const prepare: PrepareOptions = { ...(rewriteLink ? { rewriteLink } : {}), ...(opts.prepare ?? {}) };
  return cache(async (path: string): Promise<FoliwakePageData | null> => {
    if (opts.authorize && !(await opts.authorize())) return null;
    return readOrNull(() => readPage(path, { ...prepare, channel }));
  });
}

/**
 * A page route of Foliwake pages: reads the page of the route's path (live: cached; preview: per request, behind
 * `authorize`), renders it in a Suspense boundary, emits the blocks' preload hints and the import map. A missing
 * page, one outside `app.pages`, or a refused author check is `notFound()`. `generateMetadata` gives the title
 * (the body's first `<h1>`) and `noindex` for preview.
 */
export function createFoliwakePage(opts: FoliwakePageOptions = {}): FoliwakeRoute {
  const channel = checkPageChannel(opts.channel, opts.authorize);
  checkMount(opts.mount);
  const read = pageReader(opts, channel);
  const render = opts.render ?? defaultRender;

  async function Body({ params }: FoliwakeRouteProps): Promise<ReactNode> {
    const page = await read(pagePathOf((await params).path));
    if (page === null) notFound();
    emitPreloadHints(page);
    return (
      <>
        <FoliwakeImportMap page={page} />
        {render(page)}
      </>
    );
  }

  const Route = (props: FoliwakeRouteProps): ReactNode => (
    <Suspense fallback={opts.fallback ?? null}>
      <Body params={props.params} />
    </Suspense>
  );
  const generateMetadata = async ({ params }: FoliwakeRouteProps) =>
    metadataOf(await read(pagePathOf((await params).path)), channel);
  return Object.assign(Route, { generateMetadata });
}

const route = createFoliwakePage();

/** The default route: live pages at the app's root. */
export default route;

/** The default route's metadata. */
export const generateMetadata = route.generateMetadata;
