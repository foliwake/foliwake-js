// `foliwake dev --remote`: what a request path is served from, the remote URL it maps to, which browser
// requests reach the listener at all, and the fixed request and response headers towards the remote site.
// Pure helpers; the server is remote-dev.ts.
import { isLoopbackHost } from '../settings.js';
import { CODE_PREFIXES, decodeSegments, isKitFile } from './local-code.js';

/** The author block catalog of a preview origin; `dev --remote` answers it with a stub. */
export const BLOCK_CATALOG_PATH = '/_foliwake/blocks';

const MISDIRECTED_TEXT = 'This listener answers only loopback host names (127.0.0.1, localhost, *.localhost).\n';

/** Content-addressed media of the deployed origin: the only /media paths fetched. */
export const REMOTE_MEDIA_PATTERN = /^\/media\/[0-9a-f]{64}\.(?:jpg|jpeg|png|gif|webp|avif)$/;
/** Browser cache of proxied media: short, private, not immutable. */
export const REMOTE_MEDIA_CACHE = 'private, max-age=300';
const MAX_PATH_LENGTH = 2048;
const MAX_QUERY_LENGTH = 2048;
export const DEFAULT_REMOTE_TIMEOUT_MS = 15000;
const RELEASE_HEADER_VALUE = /^[a-z]{2}_[0-9a-f]{8,64}$/;

export const DEPLOYED_CODE_TEXT =
  'Deployed code is never loaded in local development: foliwake dev --remote serves components/, scripts/ and ' +
  'styles/ from this checkout.\n';

/** What one request path is served from. */
export type RemoteRoute =
  | { kind: 'code'; prefix: string; rest: string[] }
  | { kind: 'media'; path: string }
  | { kind: 'deployed-code' }
  | { kind: 'dev'; path: string }
  | { kind: 'page'; path: string }
  | { kind: 'not-found' };

/** Classifies a raw request path (without the query). Unsafe paths are `not-found` and never reach the remote site. */
export function classifyRemoteRoute(rawPath: string): RemoteRoute {
  if (!rawPath.startsWith('/') || rawPath.length > MAX_PATH_LENGTH) return { kind: 'not-found' };
  let segments: string[];
  try {
    segments = decodeSegments(rawPath);
  } catch {
    return { kind: 'not-found' };
  }
  const [first, ...rest] = segments;
  if (CODE_PREFIXES.includes(first) || isKitFile(segments)) return { kind: 'code', prefix: first, rest };
  if (first === 'media')
    return REMOTE_MEDIA_PATTERN.test(rawPath) ? { kind: 'media', path: rawPath } : { kind: 'not-found' };
  if (first === 'code') return { kind: 'deployed-code' };
  if (first === '_dev' || rawPath === BLOCK_CATALOG_PATH || rawPath.startsWith(`${BLOCK_CATALOG_PATH}/`))
    return { kind: 'dev', path: rawPath };
  // `//host` (an empty first segment) and empty inner segments are never forwarded.
  if (segments.slice(0, -1).some((s) => s === '')) return { kind: 'not-found' };
  if (segments.some((s) => s.startsWith('.'))) return { kind: 'not-found' };
  if (/[\u0000-\u0020\u007f]/.test(rawPath)) return { kind: 'not-found' };
  return { kind: 'page', path: rawPath };
}

/** The remote URL of a page or media path: always on `origin`, or null. */
export function remoteUrl(origin: string, rawPath: string, query: string): URL | null {
  if (query.length > MAX_QUERY_LENGTH || /[\u0000-\u0020\u007f#]/.test(query)) return null;
  let url: URL;
  try {
    url = new URL(rawPath + (query ? `?${query}` : ''), origin);
  } catch {
    return null;
  }
  return url.origin === origin ? url : null;
}

// Host header: a loopback name with an explicit port.
function hostPort(hostHeader: string): number | null {
  const match = /^(?:\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(hostHeader.trim());
  return match ? Number(match[1]) : null;
}

export type LocalRequestCheck = { ok: true } | { ok: false; status: 403 | 421; message: string };

/**
 * The browser request may reach this listener only from itself: Host must be a
 * loopback name with the listening port (DNS rebinding), and an Origin header,
 * when present, must be this listener's own origin.
 */
export function checkLocalRequest(
  headers: { host?: string | undefined; origin?: string | undefined },
  port: number,
): LocalRequestCheck {
  const host = headers.host;
  if (!isLoopbackHost(host) || hostPort(host ?? '') !== port) {
    return { ok: false, status: 421, message: `${MISDIRECTED_TEXT.trimEnd()} Use http://127.0.0.1:${port}/.\n` };
  }
  const origin = headers.origin;
  if (origin !== undefined && origin.toLowerCase() !== `http://${(host ?? '').trim().toLowerCase()}`) {
    return { ok: false, status: 403, message: 'Requests from other origins are refused by foliwake dev --remote.\n' };
  }
  return { ok: true };
}

const ACCEPT_LANGUAGE = /^[A-Za-z0-9*,;=. -]{1,256}$/;

/**
 * The complete set of headers sent to the remote site: fixed values, a
 * validated Accept-Language and the configured Authorization. Nothing else
 * from the browser request is forwarded (no cookies, no browser credentials).
 */
export function remoteRequestHeaders({
  kind,
  acceptLanguage,
  authorization,
}: {
  kind: 'page' | 'media';
  acceptLanguage?: string | string[] | undefined;
  authorization: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: kind === 'page' ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' : 'image/avif,image/webp,image/*;q=0.8',
    'User-Agent': 'foliwake-dev',
  };
  if (kind === 'page') headers['Cache-Control'] = 'no-cache';
  if (typeof acceptLanguage === 'string' && ACCEPT_LANGUAGE.test(acceptLanguage))
    headers['Accept-Language'] = acceptLanguage;
  if (authorization) headers.Authorization = authorization;
  return headers;
}

/**
 * The only remote response headers passed to the browser: the release IDs of
 * the deployed site (validated). Set-Cookie, WWW-Authenticate, caching,
 * hop-by-hop and every other header are dropped.
 */
export function pickRemoteHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of ['X-Preview-Release', 'X-Code-Release'] as const) {
    const value = headers.get(name);
    if (value && RELEASE_HEADER_VALUE.test(value)) picked[name] = value;
  }
  return picked;
}
