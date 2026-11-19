// One handler for every Foliwake route of an app, on the Web Request/Response of any framework (Hono, Express with a
// fetch adapter, Bun, Deno, Next): the code and media proxies under the config's prefixes, the hook a Foliwake
// server calls after a change, and a health check. Preview is off unless the app passes its author check.
//
//   <proxies.code>/[preview/]<cd>/<file>   GET, HEAD   files of a code release (codeHandler)
//   <proxies.media>/[preview/]<sha256>.<ext> GET, HEAD hashed pictures (mediaHandler)
//   <base>/hook                             POST        signed hook (FOLIWAKE_HOOK_SECRET)
//   <base>/health                           GET, HEAD   { ok, site }, no-store
//   anything else                           404
import { checkEnvName, type FoliwakeAppConfig } from './config.js';
import { PREFIX } from './config-parts.js';
import { codeHandler, mediaHandler, type AuthorizePreview, type Handler } from './handlers.js';
import { createHookEndpoint, hookSecretsFrom } from './hook-endpoint.js';
import type { FoliwakeDeliveryPayload } from './hook.js';
import { createOriginClient } from './origin.js';
import { loadAppConfig } from './resolve.js';
import { SERVER_SDK } from './version.js';

/** The variable the hook's shared secret is read from by default. */
export const HOOK_SECRET_ENV = 'FOLIWAKE_HOOK_SECRET';
/** Where the handler is mounted by default: `/foliwake/hook`, `/foliwake/health`. */
export const HANDLER_BASE = '/foliwake';

/** The hook endpoint of the handler. */
export interface FoliwakeHookOptions {
  /** The variable holding the shared secret; default FOLIWAKE_HOOK_SECRET. */
  secretEnv?: string;
  /** While the secret is rotated: the variable holding the previous one, also accepted. */
  previousSecretEnv?: string;
  /** Called for every delivery (expire your own caches here); a throw answers 500 and the server retries. */
  onDelivery?: (payload: FoliwakeDeliveryPayload) => void | Promise<void>;
  /** The allowed clock distance of the signature, in seconds; default 300. */
  toleranceS?: number;
  /** Replaces the endpoint (a framework adapter's own, such as Next's tag expiry). */
  endpoint?: (request: Request) => Promise<Response>;
}

/** Options of `createFoliwakeHandler`. */
export interface FoliwakeHandlerOptions {
  /** The app config, or how to get it; default loadAppConfig() (FOLIWAKE_URL + the optional file), once. */
  config?: FoliwakeAppConfig | (() => FoliwakeAppConfig | Promise<FoliwakeAppConfig>);
  /** The app path of the hook and health routes; default `/foliwake`. */
  base?: string;
  /** The app's author check for preview files; default `false` (preview answers 404). */
  authorizePreview?: AuthorizePreview;
  /** The hook endpoint's options; `false` answers 404 on `<base>/hook`. */
  hook?: false | FoliwakeHookOptions;
  /** Where secrets and FOLIWAKE_URL are read; default process.env. */
  env?: NodeJS.ProcessEnv;
  /** A fetch implementation (tests); default globalThis.fetch. */
  fetch?: typeof fetch;
  log?: Pick<Console, 'warn' | 'error'>;
}

/** A request handler on the Web Fetch API. */
export type FoliwakeFetchHandler = (request: Request) => Promise<Response>;

interface Ready {
  config: FoliwakeAppConfig;
  code: Handler;
  media: Handler;
  hook: FoliwakeFetchHandler | null;
}

type Route = { kind: 'code' | 'media'; path: string[] } | { kind: 'hook' | 'health' };

function text(status: number, body: string): Response {
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
  return new Response(`${body}\n`, { status, headers: { ...headers, 'X-Content-Type-Options': 'nosniff' } });
}

/** The decoded segments of `pathname` under `prefix`, or null when it is not under it. */
function segmentsUnder(pathname: string, prefix: string): string[] | null {
  if (!pathname.startsWith(`${prefix}/`)) return null;
  try {
    return pathname
      .slice(prefix.length + 1)
      .split('/')
      .map(decodeURIComponent);
  } catch {
    return null;
  }
}

function routeOf(pathname: string, config: FoliwakeAppConfig, base: string): Route | null {
  const app = config.app!;
  const code = segmentsUnder(pathname, app.proxies.code);
  if (code) return { kind: 'code', path: code };
  const media = segmentsUnder(pathname, app.proxies.media);
  if (media) return { kind: 'media', path: media };
  if (pathname === `${base}/hook`) return { kind: 'hook' };
  if (pathname === `${base}/health`) return { kind: 'health' };
  return null;
}

function checkOptions(opts: FoliwakeHandlerOptions): string {
  const base = opts.base ?? HANDLER_BASE;
  if (!PREFIX.test(base)) {
    throw new TypeError(`base: an absolute app path of [a-z0-9-] segments, such as "${HANDLER_BASE}".`);
  }
  const authorize = opts.authorizePreview ?? false;
  if (authorize !== false && typeof authorize !== 'function') {
    throw new TypeError('authorizePreview: a function or false.');
  }
  if (opts.hook) {
    if (opts.hook.secretEnv !== undefined) checkEnvName(opts.hook.secretEnv, 'hook.secretEnv');
    if (opts.hook.previousSecretEnv !== undefined) checkEnvName(opts.hook.previousSecretEnv, 'hook.previousSecretEnv');
  }
  return base;
}

function defaultHook(config: FoliwakeAppConfig, opts: FoliwakeHandlerOptions, hook: FoliwakeHookOptions) {
  const env = opts.env ?? process.env;
  const log = opts.log ?? console;
  const secretEnv = hook.secretEnv ?? HOOK_SECRET_ENV;
  return createHookEndpoint({
    site: config.site,
    sdk: SERVER_SDK,
    secrets: hookSecretsFrom({ names: [secretEnv, hook.previousSecretEnv], env, log }),
    liveTag: (path) => `foliwake:${config.site}:live${path === undefined ? '' : `:page:${path}`}`,
    expire: () => {},
    warm: async () => {},
    schedule: (task) => void task().catch((error) => log.error('[foliwake] hook task failed', error)),
    warmPages: false,
    onDelivery: hook.onDelivery,
    toleranceS: hook.toleranceS,
    log,
  });
}

function hookOf(config: FoliwakeAppConfig, opts: FoliwakeHandlerOptions): FoliwakeFetchHandler | null {
  if (opts.hook === false) return null;
  const hook = opts.hook ?? {};
  return hook.endpoint ?? defaultHook(config, opts, hook);
}

async function configOf(opts: FoliwakeHandlerOptions): Promise<FoliwakeAppConfig> {
  if (typeof opts.config === 'function') return opts.config();
  if (opts.config) return opts.config;
  return loadAppConfig({ env: opts.env, fetch: opts.fetch });
}

async function prepare(opts: FoliwakeHandlerOptions): Promise<Ready> {
  const config = await configOf(opts);
  if (!config.app) throw new TypeError(`${config.from}: "app" is required for an app.`);
  const client = createOriginClient(config, opts.env ?? process.env, opts.fetch ? { fetch: opts.fetch } : {});
  const proxy = { authorizePreview: opts.authorizePreview ?? false };
  const code = codeHandler(config, client, proxy);
  return { config, code, media: mediaHandler(config, client, proxy), hook: hookOf(config, opts) };
}

function health(request: Request, config: FoliwakeAppConfig): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const response = Response.json({ ok: true, site: config.site }, { headers: { 'Cache-Control': 'no-store' } });
  return request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;
}

async function dispatch(request: Request, ready: Ready, base: string): Promise<Response> {
  const route = routeOf(new URL(request.url).pathname, ready.config, base);
  if (route === null) return text(404, 'Not found');
  if (route.kind === 'code') return ready.code(request, { path: route.path });
  if (route.kind === 'media') return ready.media(request, { path: route.path });
  if (route.kind === 'health') return health(request, ready.config);
  return ready.hook ? ready.hook(request) : text(404, 'Not found');
}

/**
 * The Foliwake routes of an app as one `(request) => Promise<Response>`. The config is read on the first request
 * (FOLIWAKE_URL and its discovery document, unless `config` is given) and kept; a failed read is tried again on the
 * next request and answers 503 meanwhile.
 *
 * @param opts - `config`, `base`, `authorizePreview` (default false), `hook`, `env`, `fetch`, `log`.
 */
export function createFoliwakeHandler(opts: FoliwakeHandlerOptions = {}): FoliwakeFetchHandler {
  const base = checkOptions(opts);
  const log = opts.log ?? console;
  let ready: Promise<Ready> | null = null;
  return async (request) => {
    ready ??= prepare(opts);
    let current: Ready;
    try {
      current = await ready;
    } catch (error) {
      ready = null;
      log.error('[foliwake] the app config could not be read', error);
      return text(503, 'Foliwake is not configured');
    }
    return dispatch(request, current, base);
  };
}
