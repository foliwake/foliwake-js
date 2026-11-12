// Reading a page from the origin (the envelope: the only thing an app caches) and preparing it per request
// (design §6.5, §9.4): check → rewrite media and links → the app's transform → check again.
import { createHash } from 'node:crypto';
import type { ChannelName, CodeReleaseId, FoliwakePageData, PageEnvelope } from '@foliwake/blocks-contract/page';
import type { BlockMode } from '@foliwake/blocks-contract';
import { appOf, isLoopbackName, pageAllowed, type FoliwakeAppConfig } from './config.js';
import { CODE_ID_PATTERN, LIMITS, PAGE_PATH_PATTERN } from './constants.js';
import { FoliwakePageError } from './errors.js';
import { checkBody, componentNames, elements, serialize, type HtmlNode } from './html.js';
import { mediaRewriter } from './media-rewrite.js';
import type { OriginClient } from './origin.js';
import { readLimited, TooLargeError } from './stream.js';

export { FoliwakePageError, type PageErrorKind } from './errors.js';
export type { PageEnvelope, FoliwakePageData } from '@foliwake/blocks-contract/page';

const HTML_CONTRACT = /^\d{1,4}$/;
const LANG = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;
const PAGE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const GENERATION = /^[A-Za-z0-9_.:-]{1,128}$/;

/** The origin URL path of a page's body (`/` → `/index.plain.html`). */
export function plainPath(pagePath: string): string {
  return `${pagePath === '/' ? '/index' : pagePath}.plain.html`;
}

function header(response: Response, name: string, pattern: RegExp, required = false): string | null {
  const value = response.headers.get(name);
  if (value === null) {
    if (required) throw new FoliwakePageError('invalid', `The origin answered without ${name}.`);
    return null;
  }
  if (!pattern.test(value)) throw new FoliwakePageError('invalid', `The origin answered an invalid ${name}.`);
  return value;
}

function codeReleaseOf(response: Response, client: OriginClient, channel: ChannelName): CodeReleaseId | null {
  const value = response.headers.get('x-code-release');
  if (value === null) return null; // plain/1 origin: the body is shown static
  if (CODE_ID_PATTERN.test(value)) return value as CodeReleaseId;
  if (value === 'local' && isLoopbackName(new URL(client.originOf(channel)).hostname)) return 'local';
  throw new FoliwakePageError('invalid', 'The origin answered an invalid X-Code-Release.');
}

let warnedPlain1 = false;

/**
 * Reads `<path>.plain.html` from the channel's origin. Primitive inputs only, no callbacks and no signal
 * (an internal 10 s timeout), so it can run inside a cache function. Refuses paths outside `app.pages`.
 *
 * @param site - The config's site (`config.site`); another site is refused.
 * @param path - The page path (`/`, `/lessons/a`).
 * @returns The envelope; throws FoliwakePageError (`not_found`, `not_allowed`, `origin`, `unauthorized`, …).
 */
export async function readEnvelope(config: FoliwakeAppConfig, client: OriginClient, site: string, channel: ChannelName, path: string): Promise<PageEnvelope> {
  if (site !== config.site) throw new FoliwakePageError('not_allowed', `This app reads the site ${config.site}, not ${site}.`);
  if (channel !== 'live' && channel !== 'preview') throw new FoliwakePageError('not_allowed', 'channel must be live or preview');
  if (typeof path !== 'string' || !PAGE_PATH_PATTERN.test(path)) throw new FoliwakePageError('not_found', 'Not a page path.');
  if (!pageAllowed(config, path)) throw new FoliwakePageError('not_allowed', `${path} is outside app.pages in ${config.from}.`);
  let response: Response;
  try {
    response = await client.request(channel, plainPath(path), { headers: { Accept: 'text/html' } });
  } catch (error) {
    if (error instanceof Error && error.name === 'FoliwakeConfigError') throw error;
    throw new FoliwakePageError('origin', `The ${channel} site did not answer.`, { cause: error });
  }
  const discard = () => response.body?.cancel().catch(() => {});
  if (response.status === 404) {
    await discard();
    throw new FoliwakePageError('not_found', `${path} does not exist on the ${channel} site.`, { status: 404 });
  }
  if (response.status === 401 || response.status === 403) {
    await discard();
    throw new FoliwakePageError('unauthorized', `The ${channel} site refused the credentials (HTTP ${response.status}).`, { status: response.status });
  }
  if (response.status !== 200) {
    await discard();
    throw new FoliwakePageError('origin', `The ${channel} site answered HTTP ${response.status}.`, { status: response.status });
  }
  if (!/^text\/html\s*(;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await discard();
    throw new FoliwakePageError('invalid', 'The origin answered a body that is not text/html.');
  }
  const codeRelease = codeReleaseOf(response, client, channel);
  const htmlContract = header(response, 'x-html-contract', HTML_CONTRACT, true)!;
  const lang = header(response, 'content-language', LANG);
  const pageId = header(response, 'x-page-id', PAGE_ID);
  const generation = header(response, 'x-site-generation', GENERATION);
  const etag = response.headers.get('etag');
  let bytes: Uint8Array;
  try {
    bytes = await readLimited(response, LIMITS.body);
  } catch (error) {
    if (error instanceof TooLargeError) throw new FoliwakePageError('too_large', `${path} is larger than ${LIMITS.body} bytes.`);
    throw new FoliwakePageError('origin', `Reading ${path} from the ${channel} site failed.`, { cause: error });
  }
  let html: string;
  try {
    html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new FoliwakePageError('invalid', 'The body is not UTF-8.');
  }
  checkBody(html, path); // an invalid body is refused before anything caches it
  if (codeRelease === null && !warnedPlain1) {
    warnedPlain1 = true;
    console.warn(`[foliwake] the ${channel} site sends no X-Code-Release (plain/1): bodies are shown without blocks.`);
  }
  return { site, channel, path, html, codeRelease, htmlContract, lang, pageId, etag: etag && etag.length <= 200 ? etag : null, generation };
}

/** Options of `preparePage`. */
export interface PrepareOptions {
  /** The blocks' mode (default `practice`); `exam` comes later. */
  mode?: 'practice' | 'review';
  /** Root-relative links (`/x`) of `<a href>`; returns the app's URL. */
  rewriteLink?: (href: string) => string;
  /** The app's own change of the body (allow-list, artwork, …); its output is checked again. */
  transform?: (html: string, envelope: PageEnvelope) => string;
}

function rewrite(nodes: HtmlNode[], config: FoliwakeAppConfig, channel: ChannelName, rewriteLink?: (href: string) => string): void {
  const media = mediaRewriter(appOf(config), channel);
  for (const element of elements(nodes)) {
    const a = element.attribs;
    if (a.srcset !== undefined) a.srcset = media.srcset(a.srcset);
    if (a.src !== undefined) a.src = element.name === 'img' ? media.src(a.src, element.attribs.srcset) : media.url(a.src);
    if (a.poster !== undefined) a.poster = media.url(a.poster);
    if (a.href !== undefined) {
      const rewritten = media.url(a.href);
      if (rewritten !== a.href) a.href = rewritten;
      else if (rewriteLink && element.name === 'a' && a.href.startsWith('/') && !a.href.startsWith('//')) a.href = rewriteLink(a.href);
    }
  }
}

/** The same-origin URL of the blocks module, or null (no entry, no code release, or `local` from a remote origin). */
export function blocksUrlOf(config: FoliwakeAppConfig, channel: ChannelName, codeRelease: CodeReleaseId | null): { base: string; url: string } | null {
  const app = appOf(config);
  if (!app.blocks.entry || !codeRelease) return null;
  const base = `${app.proxies.code}${channel === 'preview' ? '/preview' : ''}/${codeRelease}/`;
  return { base, url: `${base}${app.blocks.entry}` };
}

/**
 * Per request, after the cache: check → rewrite media/links → transform → check again → serialise.
 *
 * @param envelope - What readEnvelope (or a cached copy of it) returned.
 * @returns The serialisable page for a client component (`preload` is empty; readPage of the Next package
 *   fills it). Throws FoliwakePageError('invalid') when the body or the transform's output is refused.
 */
export function preparePage(config: FoliwakeAppConfig, envelope: PageEnvelope, opts: PrepareOptions = {}): FoliwakePageData {
  const app = appOf(config);
  const mode: BlockMode = opts.mode ?? 'practice';
  if (mode !== 'practice' && mode !== 'review') throw new FoliwakePageError('not_allowed', `mode ${String(mode)} is not available`);
  const nodes = checkBody(envelope.html, envelope.path);
  rewrite(nodes, config, envelope.channel, opts.rewriteLink);
  let html = serialize(nodes);
  if (opts.transform) html = opts.transform(html, envelope);
  const final = checkBody(html, envelope.path); // a transform cannot add what the first check refused
  html = serialize(final);
  const blocks = blocksUrlOf(config, envelope.channel, envelope.codeRelease);
  const contract = { major: app.blocks.major, eventPrefix: app.blocks.eventPrefix };
  // The digest covers what the browser mounts: the final prepared body (after the app's transform, so two
  // transforms of one envelope differ, and a missing ETag cannot collide) and every mount-defining setting.
  const digest = createHash('sha256')
    .update(JSON.stringify([html, blocks?.url ?? null, contract.major, contract.eventPrefix, envelope.htmlContract, envelope.lang]))
    .digest('base64url')
    .slice(0, 22);
  return {
    identity: [envelope.site, envelope.channel, envelope.path, envelope.etag ?? '', envelope.codeRelease ?? '', mode, digest].join('|'),
    site: envelope.site,
    channel: envelope.channel,
    path: envelope.path,
    mode,
    html,
    codeRelease: envelope.codeRelease,
    htmlContract: envelope.htmlContract,
    lang: envelope.lang,
    blocks: componentNames(final),
    blocksUrl: blocks?.url ?? null,
    codeBase: blocks?.base ?? null,
    contract,
    preload: [],
  };
}
