// The parts of the ready page route (`@foliwake/next/page`) that need no Next: the page path of the route's
// segments, the link rewrite of a mount, the metadata of a page, and the reading with "missing → not found".
import type { ChannelName, FoliwakePageData } from '@foliwake/blocks-contract/page';

const MOUNT = /^(?:\/[a-z0-9-]+)+$/;

/** The metadata the route gives Next: the page's title, and `noindex` for preview. */
export interface PageMetadata {
  title?: string;
  robots?: { index: false; follow: false };
}

/** The site's page path of a catch-all route's segments (`['lessons', 'a']` → `/lessons/a`, none → `/`). */
export function pagePathOf(segments: readonly string[] | undefined): string {
  return `/${(segments ?? []).join('/')}`;
}

/** Checks the channel of a page route; preview needs the app's author check. */
export function checkPageChannel(channel: ChannelName | undefined, authorize: unknown): ChannelName {
  const chosen = channel ?? 'live';
  if (chosen !== 'live' && chosen !== 'preview') throw new TypeError("channel: 'live' or 'preview'.");
  if (chosen === 'preview' && typeof authorize !== 'function') {
    throw new TypeError("A preview page needs authorize: the app's author check; no default shows preview.");
  }
  return chosen;
}

/** Checks a mount (`/pages`) and returns it, or null for the app's root. */
export function checkMount(mount: string | undefined): string | null {
  if (mount === undefined || mount === '/') return null;
  if (!MOUNT.test(mount)) throw new TypeError(`mount: an app path of [a-z0-9-] segments, such as "/pages".`);
  return mount;
}

/** How the body's root-relative links become app links: as they are at the root, under the mount otherwise. */
export function mountRewriter(mount: string | null): ((href: string) => string) | undefined {
  if (mount === null) return undefined;
  return (href) => `${mount}${href === '/' ? '' : href}`;
}

/** The metadata of a page (null: not found, nothing to say). */
export function metadataOf(page: FoliwakePageData | null, channel: ChannelName): PageMetadata {
  const metadata: PageMetadata = {};
  if (page?.title) metadata.title = page.title;
  if (channel === 'preview') metadata.robots = { index: false, follow: false };
  return metadata;
}

function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, kind } = error as { name?: string; kind?: string };
  return name === 'FoliwakePageError' && (kind === 'not_found' || kind === 'not_allowed');
}

/** Reads a page; a missing page or one outside `app.pages` is null; any other error is thrown. */
export async function readOrNull(read: () => Promise<FoliwakePageData>): Promise<FoliwakePageData | null> {
  try {
    return await read();
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
