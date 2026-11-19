// The site's discovery document, `GET <live origin>/.well-known/foliwake.json`: the public facts an app needs to
// read a site (its preview origin, media CDN and contract majors), so the app is configured by one address,
// FOLIWAKE_URL. The document holds no secrets; trust in it is limited by these rules: `live.url` must be the
// origin it was read from, other origins are parsed like config origins, redirects are not followed and the
// size is capped.
import { parseRemoteUrl } from './config-checks.js';
import { isObject, SITE } from './config-parts.js';
import { FoliwakeConfigError } from './errors.js';
import { readLimited, TooLargeError } from './stream.js';

/** Where a site serves its discovery document, on each of its hosts. */
export const DISCOVERY_PATH = '/.well-known/foliwake.json';
/** The environment variable with the site's live origin. */
export const URL_ENV = 'FOLIWAKE_URL';
/** The major of the discovery format this package reads. */
export const DISCOVERY_VERSION = 1;
/** The plain HTML contract this package reads (`X-Code-Release` on `.plain.html`). */
export const PLAIN_CONTRACT = 2;
/** The largest discovery document read, in bytes. */
export const DISCOVERY_LIMIT = 16 * 1024;

const TIMEOUT_MS = 5000;

/** A validated discovery document. Unknown keys are ignored, so a newer engine may add some. */
export interface FoliwakeDiscovery {
  site: string;
  live: { url: string };
  /** Null when the site has no preview host. Its Basic user is always `preview`. */
  preview: { url: string } | null;
  /** The CDN that resizes live images (its origin), or null. */
  media: { cdn: string } | null;
  contracts: { plain: number; html: number | null; blocks: number | null; hook: number | null };
}

/** Options of `fetchDiscovery`. */
export interface FetchDiscoveryOptions {
  /** A fetch implementation (tests); default globalThis.fetch. */
  fetch?: typeof fetch;
  /** Per attempt; default 5000. */
  timeoutMs?: number;
}

function problem(where: string, text: string): FoliwakeConfigError {
  return new FoliwakeConfigError(`${where}: ${text}`);
}

function positiveOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function checkVersions(doc: Record<string, unknown>, where: string): FoliwakeDiscovery['contracts'] {
  const format = isObject(doc.foliwake) ? doc.foliwake.discovery : undefined;
  if (format !== DISCOVERY_VERSION) {
    const text = `discovery format ${JSON.stringify(format)}; this package reads ${DISCOVERY_VERSION}.`;
    throw problem(where, `${text} Update @foliwake/next (or the engine) so both speak the same format.`);
  }
  const contracts = isObject(doc.contracts) ? doc.contracts : {};
  if (contracts.plain !== PLAIN_CONTRACT) {
    const served = JSON.stringify(contracts.plain);
    const text = `the site serves plain/${served}; this package reads plain/${PLAIN_CONTRACT}.`;
    throw problem(where, `${text} The site runs an older or newer engine than this package expects.`);
  }
  return {
    plain: PLAIN_CONTRACT,
    html: positiveOrNull(contracts.html),
    blocks: positiveOrNull(contracts.blocks),
    hook: positiveOrNull(contracts.hook),
  };
}

function liveOf(doc: Record<string, unknown>, origin: string, where: string): { url: string } {
  const live = isObject(doc.live) ? parseRemoteUrl(doc.live.url, `${where} "live.url"`) : null;
  if (live !== origin) {
    throw problem(where, `"live.url" is ${JSON.stringify(live)}, but the document was read from ${origin}.`);
  }
  return { url: live };
}

function previewOf(doc: Record<string, unknown>, where: string): { url: string } | null {
  if (doc.preview === null || doc.preview === undefined) return null;
  if (!isObject(doc.preview)) throw problem(where, '"preview" must be an object {"url": …} or null.');
  return { url: parseRemoteUrl(doc.preview.url, `${where} "preview.url"`) };
}

function mediaOf(doc: Record<string, unknown>, where: string): { cdn: string } | null {
  const cdn = isObject(doc.media) ? doc.media.cdn : null;
  if (cdn === null || cdn === undefined) return null;
  const origin = parseRemoteUrl(cdn, `${where} "media.cdn"`);
  if (!origin.startsWith('https:')) throw problem(where, '"media.cdn" must be https.');
  return { cdn: origin };
}

/**
 * Validates a discovery document read from `origin` (the scheme, host and port of FOLIWAKE_URL).
 * Throws FoliwakeConfigError naming the field.
 */
export function parseDiscovery(value: unknown, origin: string): FoliwakeDiscovery {
  const where = `${origin}${DISCOVERY_PATH}`;
  if (!isObject(value)) throw problem(where, 'not a JSON object.');
  const contracts = checkVersions(value, where);
  if (typeof value.site !== 'string' || !SITE.test(value.site)) throw problem(where, '"site" is not a site name.');
  return Object.freeze({
    site: value.site,
    live: liveOf(value, origin, where),
    preview: previewOf(value, where),
    media: mediaOf(value, where),
    contracts,
  });
}

function isJson(response: Response): boolean {
  return /^application\/json\s*(;|$)/i.test(response.headers.get('content-type') ?? '');
}

async function bodyOf(response: Response, where: string): Promise<unknown> {
  if (!isJson(response)) throw problem(where, 'the answer is not application/json.');
  try {
    return JSON.parse(new TextDecoder().decode(await readLimited(response, DISCOVERY_LIMIT)));
  } catch (error) {
    if (error instanceof TooLargeError) throw problem(where, `larger than ${DISCOVERY_LIMIT} bytes.`);
    throw problem(where, 'the answer is not valid JSON.');
  }
}

function statusProblem(response: Response, where: string): FoliwakeConfigError {
  if (response.status >= 300 && response.status < 400) {
    return problem(where, `redirects (HTTP ${response.status}); give FOLIWAKE_URL as the site's final origin.`);
  }
  if (response.status === 404) {
    return problem(where, 'not found (HTTP 404): the site runs an engine without discovery, or this is not its URL.');
  }
  return problem(where, `HTTP ${response.status}.`);
}

/** Network failures and 5xx are tried once more; anything else is an answer. */
async function requestTwice(url: string, opts: FetchDiscoveryOptions): Promise<Response> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const attempt = () =>
    doFetch(url, {
      redirect: 'manual',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
  try {
    const first = await attempt();
    if (first.status < 500) return first;
    await first.body?.cancel().catch(() => {});
  } catch {
    // tried again below
  }
  return attempt();
}

/**
 * Reads and validates the discovery document of the site at `siteUrl` (FOLIWAKE_URL: https, or http for loopback
 * hosts; origin only). 5 s per attempt, one retry, no redirects, at most 16 KiB of JSON.
 */
export async function fetchDiscovery(siteUrl: string, opts: FetchDiscoveryOptions = {}): Promise<FoliwakeDiscovery> {
  const origin = parseRemoteUrl(siteUrl, URL_ENV);
  const where = `${origin}${DISCOVERY_PATH}`;
  let response: Response;
  try {
    response = await requestTwice(where, opts);
  } catch (error) {
    throw problem(where, `no answer (${(error as Error).name}).`);
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    throw statusProblem(response, where);
  }
  return parseDiscovery(await bodyOf(response, where), origin);
}
