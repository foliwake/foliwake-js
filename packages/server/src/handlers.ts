// Code and media proxies on Web Request/Response (design §9.2, §9.3). The app's own origin serves a code
// release's files (so `script-src 'self'` covers blocks) and media, with credentials added on the server.
// Nothing of the browser's request is forwarded. Preview needs `authorizePreview` (no default serves it)
// and is answered `private, no-store`.
import type { ChannelName } from '@foliwake/blocks-contract/page';
import { isLoopbackName, type FoliwakeAppConfig } from './config.js';
import { CODE_FILE_TYPES, CODE_ID_PATTERN, CODE_ROOTS, CODE_SEGMENT, LIMITS, MEDIA_KEY_PATTERN, MEDIA_TYPES, SVG_CODE_CSP } from './constants.js';
import type { OriginClient } from './origin.js';
import { declaredTooLarge, limitStream } from './stream.js';

export type Handler = (request: Request, params: { path: string[] }) => Promise<Response>;
export type AuthorizePreview = ((request: Request) => boolean | Promise<boolean>) | false;
export interface ProxyOptions {
  /** The app's author check for `preview/…` requests, or `false` to answer them 404. Required. */
  authorizePreview: AuthorizePreview;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
const PRIVATE = 'private, no-store';

function plain(status: number, text: string, cacheControl = 'no-store'): Response {
  return new Response(`${text}\n`, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff' } });
}
const notFound = (cc?: string) => plain(404, 'Not found', cc);
const badGateway = (cc?: string) => plain(502, 'Bad gateway', cc);

function requireOptions(opts: ProxyOptions | undefined, what: string): AuthorizePreview {
  if (!opts || (opts.authorizePreview !== false && typeof opts.authorizePreview !== 'function')) {
    throw new TypeError(`${what}: pass { authorizePreview: <the app's author check> } or { authorizePreview: false }; no default serves preview.`);
  }
  return opts.authorizePreview;
}

async function channelOf(request: Request, path: string[], authorize: AuthorizePreview): Promise<{ channel: ChannelName; rest: string[] } | null> {
  if (path[0] !== 'preview') return { channel: 'live', rest: path };
  if (authorize === false) return null;
  let allowed = false;
  try {
    allowed = (await authorize(request)) === true;
  } catch {
    allowed = false;
  }
  return allowed ? { channel: 'preview', rest: path.slice(1) } : null;
}

const baseType = (value: string | null) => (value ?? '').split(';')[0]!.trim().toLowerCase();
function typeMatches(expected: string, got: string): boolean {
  if (expected === 'text/javascript') return got === 'text/javascript' || got === 'application/javascript';
  return expected === got;
}

async function forward(request: Request, client: OriginClient, channel: ChannelName, upstreamPath: string, expectedType: string, limit: number, extra: Record<string, string>, immutable: boolean): Promise<Response> {
  const cacheControl = channel === 'preview' ? PRIVATE : immutable ? IMMUTABLE : 'no-store';
  const errorCc = channel === 'preview' ? PRIVATE : 'no-store';
  const head = request.method === 'HEAD';
  let upstream: Response;
  try {
    upstream = await client.request(channel, upstreamPath, { method: head ? 'HEAD' : 'GET' });
  } catch {
    return badGateway(errorCc);
  }
  const discard = () => upstream.body?.cancel().catch(() => {});
  if (upstream.status === 404) {
    await discard();
    return notFound(errorCc);
  }
  if (upstream.status !== 200 || !typeMatches(expectedType, baseType(upstream.headers.get('content-type'))) || declaredTooLarge(upstream, limit)) {
    await discard();
    return badGateway(errorCc);
  }
  const headers: Record<string, string> = { 'Content-Type': expectedType === 'text/javascript' ? 'text/javascript; charset=utf-8' : expectedType === 'text/css' ? 'text/css; charset=utf-8' : expectedType, 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff', ...extra };
  // No Content-Length: fetch decodes a gzip/br/deflate body but keeps the encoded length, so the upstream value
  // may not describe what is sent (the platform sets the length or chunks the body itself). The ETag is passed on
  // only for an unencoded body: it names the encoded representation otherwise.
  const encoded = (upstream.headers.get('content-encoding') ?? 'identity').trim().toLowerCase() !== 'identity';
  const etag = upstream.headers.get('etag');
  if (etag && etag.length <= 200 && !encoded) headers.ETag = etag;
  if (head || !upstream.body) return new Response(null, { status: 200, headers });
  return new Response(limitStream(upstream.body, limit), { status: 200, headers });
}

/** `GET|HEAD <proxies.code>/[preview/]<cd>/<path inside the code release>`. */
export function codeHandler(config: FoliwakeAppConfig, client: OriginClient, opts: ProxyOptions): Handler {
  const authorize = requireOptions(opts, 'codeHandler');
  return async (request, params) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const target = await channelOf(request, params.path, authorize);
    if (!target) return notFound(PRIVATE);
    const [cd, ...rest] = target.rest;
    const errorCc = target.channel === 'preview' ? PRIVATE : 'no-store';
    const local = cd === 'local' && isLoopbackName(new URL(client.originOf(target.channel)).hostname);
    if (cd === undefined || (!CODE_ID_PATTERN.test(cd) && !local)) return notFound(errorCc);
    if (rest.length < 1 || rest.length > 8 || !CODE_ROOTS.includes(rest[0]!)) return notFound(errorCc);
    if (rest.some((s) => !CODE_SEGMENT.test(s) || s === '.' || s === '..')) return notFound(errorCc);
    const last = rest[rest.length - 1]!;
    const dot = last.lastIndexOf('.');
    const extension = dot > 0 ? last.slice(dot) : '';
    const expected = CODE_FILE_TYPES[extension];
    if (!expected) return notFound(errorCc);
    const extra: Record<string, string> = extension === '.svg' ? { 'Content-Security-Policy': SVG_CODE_CSP } : {};
    return forward(request, client, target.channel, `/code/${cd}/${rest.join('/')}`, expected, LIMITS.code, extra, !local);
  };
}

/** `GET|HEAD <proxies.media>/[preview/]<sha256>.<ext>`: images only, one hashed segment. */
export function mediaHandler(config: FoliwakeAppConfig, client: OriginClient, opts: ProxyOptions): Handler {
  const authorize = requireOptions(opts, 'mediaHandler');
  return async (request, params) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const target = await channelOf(request, params.path, authorize);
    if (!target) return notFound(PRIVATE);
    const errorCc = target.channel === 'preview' ? PRIVATE : 'no-store';
    if (target.rest.length !== 1) return notFound(errorCc);
    const match = MEDIA_KEY_PATTERN.exec(target.rest[0]!);
    if (!match) return notFound(errorCc);
    return forward(request, client, target.channel, `/media/${target.rest[0]}`, MEDIA_TYPES[match[1]!]!, LIMITS.media, {}, true);
  };
}
