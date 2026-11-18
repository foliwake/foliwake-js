// `foliwake dev --remote [preview|live]`: local frontend code against content from a deployed Foliwake site.
//
// The remote document is never passed through. It is parsed (parse5, a WHATWG HTML parser) and only content
// is kept: the children of <main>, <title>, <meta name="description">, <html lang> and
// <html data-html-contract> (remote-page.ts). That body is wrapped in the LOCAL shell (renderPageShell),
// which links the local /styles and /scripts, and the local stylesheets of the components the page uses (as
// the local descriptor declares them). The remote shell's /code/cd_… links are never copied and /code/… is
// refused, so deployed JavaScript and CSS cannot load.
//
// Routes (classifyRemoteRoute, remote-routes.ts):
//   /components/… /scripts/… /styles/…   local working files
//   /_foliwake/block-kit.js, lit-html.js  the block kit of the installed @foliwake/block-kit
//   /media/<64 hex>.<image ext>           fetched from the remote origin
//   /code/…                               refused (404 with an explanation)
//   /_dev/…, /_foliwake/blocks             local dev endpoints; the block catalog is a stub here
//   anything else                         the remote page, in the local shell
//
// It is not a proxy: requests go only to the one configured origin, with GET, a fixed set of request
// headers (remoteRequestHeaders) and redirect:'manual'; nothing from the browser request is forwarded
// except the path, the query and a validated Accept-Language. Only a fixed set of response headers is
// produced (pickRemoteHeaders). The credential stays in this process. The remote site is never polled:
// a page is fetched when the browser asks for it.
import http, { type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from 'node:http';

import { HTML_CONTRACT } from '@foliwake/site-check/formats/constants';
import { DESCRIPTOR_PATH, shellStylesheets } from '@foliwake/site-check/formats/descriptor';
import type { Diagnostic } from '@foliwake/site-check/formats/diagnostics';

import { COMMAND } from '../settings.js';
import { createLiveCodeWatcher } from './code-watcher.js';
import { createDevChecker, descriptorDiagnostics, toProblem } from './dev-checks.js';
import {
  DEV_CLIENT_PATH,
  DEV_CLIENT_SCRIPT,
  DEV_EVENTS_PATH,
  type DevProblem,
  type ReloadHub,
  createReloadHub,
  formatProblem,
  injectDevClient,
} from './dev-reload.js';
import { escapeHtml, renderDiagnosticsPage, renderPageShell } from './html.js';
import { BASE_HEADERS, NotFound, serveCodeFile } from './local-code.js';
import type { RemoteTarget } from './remote-config.js';
import { TooLarge, errorReason, readLimited } from './remote-fetch.js';
import { blockCatalogStub, noticeBanner, problemsBanner, renderRemoteErrorPage } from './remote-html.js';
import {
  type LocalDescriptor,
  type RemotePage,
  compatibilityProblems,
  extractRemotePage,
  readLocalDescriptor,
  remoteText,
} from './remote-page.js';
import {
  BLOCK_CATALOG_PATH,
  DEFAULT_REMOTE_TIMEOUT_MS,
  DEPLOYED_CODE_TEXT,
  REMOTE_MEDIA_CACHE,
  checkLocalRequest,
  classifyRemoteRoute,
  pickRemoteHeaders,
  remoteRequestHeaders,
  remoteUrl,
} from './remote-routes.js';

/** `--watch` options: debounce, polling or native events, and the polling interval. */
export interface LiveReloadOptions {
  debounceMs?: number;
  polling?: boolean;
  codePollingIntervalMs?: number;
}

const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
};

const TAG = `[${COMMAND}]`;
const LISTEN_HOST = '127.0.0.1';

// ---------- the server ----------

type Method = string | undefined;
type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

export interface RemoteDevServerOptions {
  cwd: string;
  target: RemoteTarget;
  /** The Authorization header value (from the environment), or null. */
  authorization: string | null;
  /** Applied to every message that leaves the process (terminal and browser). */
  redact?: (text: string) => string;
  log?: (text: string) => void;
  reload?: ReloadHub;
  /** Replaces global fetch (tests). */
  fetch?: FetchLike;
  timeoutMs?: number;
}

export type RemoteDevServer = http.Server & {
  reload?: ReloadHub;
  stopped?: Promise<void>;
};

export function createRemoteDevServer({
  cwd,
  target,
  authorization,
  redact = (t) => t,
  log = (text) => process.stderr.write(text + '\n'),
  reload,
  fetch: fetchImpl = (input, init) => fetch(input, init),
  timeoutMs = DEFAULT_REMOTE_TIMEOUT_MS,
}: RemoteDevServerOptions): RemoteDevServer {
  const { channel, origin } = target;
  const reported = new Map<string, string>();
  const say = (text: string): void => log(redact(`${TAG} ${text}`));

  function send(
    res: ServerResponse,
    status: number,
    headers: OutgoingHttpHeaders,
    body: string | Buffer,
    method: Method,
  ): void {
    res.writeHead(status, { ...BASE_HEADERS, ...headers });
    res.end(method === 'HEAD' ? undefined : typeof body === 'string' ? redact(body) : body);
  }

  function sendText(
    res: ServerResponse,
    status: number,
    text: string,
    method: Method,
    headers: OutgoingHttpHeaders = {},
  ): void {
    send(res, status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers }, text, method);
  }

  // The change generation when each request arrived: a local change while the
  // remote page is being fetched makes the client reload once it connects.
  const generations = new WeakMap<ServerResponse, number>();

  // Every HTML response goes through here: with --watch it gets the dev client.
  function sendHtml(
    res: ServerResponse,
    status: number,
    html: string,
    method: Method,
    headers: OutgoingHttpHeaders = {},
  ): void {
    const page = reload ? injectDevClient(html, generations.get(res) ?? reload.generation()) : html;
    send(
      res,
      status,
      { 'Content-Type': 'text/html; charset=utf-8', 'X-Foliwake-Remote': channel, ...headers },
      page,
      method,
    );
  }

  function sendError(
    res: ServerResponse,
    status: number,
    method: Method,
    title: string,
    lines: string[],
    detail: string | null = null,
    headers: OutgoingHttpHeaders = {},
  ): void {
    say(`${channel} ${title}: ${lines.join(' ')}`);
    sendHtml(res, status, renderRemoteErrorPage({ title, lines, detail }), method, headers);
  }

  const authHint = target.auth
    ? `check ${target.auth.passwordEnv} (the password of user "${target.auth.username}"; set in the environment, ` +
      `never in a file in Git)`
    : target.from === '--remote-url'
      ? 'the site needs credentials, but none are configured: add --remote-auth-user <name> --remote-auth-env <NAME>'
      : `the site needs credentials, but ${target.from} configures none: add "auth": {"type": "basic", "username": ` +
        `…, "passwordEnv": …}`;

  // Upstream requests in progress: server.close() aborts them all.
  const active = new Set<AbortController>();

  /**
   * Runs one remote request with a signal that aborts when the browser goes
   * away before the response is complete (the ServerResponse closes without
   * having finished; a completed request's normal close is not cancellation),
   * when the server stops, or after timeoutMs. The signal stays active while
   * the remote body is read; the listener is removed when `work` settles.
   */
  async function withUpstreamSignal(
    res: ServerResponse,
    work: (signal: AbortSignal, cancelled: () => boolean) => Promise<void>,
  ): Promise<void> {
    const controller = new AbortController();
    const onClose = (): void => {
      if (!res.writableFinished) controller.abort(new Error('the browser closed the request'));
    };
    if (res.destroyed) onClose();
    else res.once('close', onClose);
    active.add(controller);
    try {
      await work(AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]), () => controller.signal.aborted);
    } finally {
      res.off('close', onClose);
      active.delete(controller);
    }
  }

  /** Aborts every upstream request in progress (server stop). */
  function abortActive(): void {
    for (const controller of active) controller.abort(new Error('the dev server is stopping'));
    active.clear();
  }

  // A request cancelled by the browser or by a server stop gets no answer.
  function dropCancelled(res: ServerResponse): void {
    if (!res.destroyed) res.destroy();
  }

  async function fetchRemote(
    url: URL,
    kind: 'page' | 'media',
    req: IncomingMessage,
    signal: AbortSignal,
  ): Promise<Response> {
    return fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      headers: remoteRequestHeaders({ kind, acceptLanguage: req.headers['accept-language'], authorization }),
      signal,
    });
  }

  /**
   * The local Location for a remote redirect target on the configured origin,
   * or null. It must classify as a page or a media path by the same route rules
   * as a browser request (no `//host`, no backslashes, no empty or dot
   * segments, no /code, /_dev or local code paths), and it is checked to
   * resolve to the same origin as this listener, so it can never become a
   * network-path (`//host/…`) redirect.
   */
  function localRedirectTarget(next: URL): string | null {
    const route = classifyRemoteRoute(next.pathname);
    if (route.kind !== 'page' && route.kind !== 'media') return null;
    if (!next.pathname.startsWith('/') || next.pathname.startsWith('//') || /\\/.test(next.pathname)) return null;
    const local = `${next.pathname}${next.search}`;
    const base = 'http://127.0.0.1';
    let resolved: URL;
    try {
      resolved = new URL(local, base);
    } catch {
      return null;
    }
    return resolved.origin === base && `${resolved.pathname}${resolved.search}` === local ? local : null;
  }

  // Answers a remote redirect: same origin → the same path locally; anything else → refused.
  function redirect(res: ServerResponse, response: Response, url: URL, method: Method, kind: 'page' | 'media'): void {
    const location = response.headers.get('location');
    let next: URL | null = null;
    try {
      next = location ? new URL(location, url) : null;
    } catch {
      next = null;
    }
    void response.body?.cancel().catch(() => {});
    if (next && next.origin === origin && !next.username && !next.password) {
      const local = localRedirectTarget(next);
      if (local)
        return send(
          res,
          302,
          { Location: local, 'X-Foliwake-Remote': channel },
          kind === 'page' ? `Redirect to ${local}\n` : '',
          method,
        );
      if (kind === 'media')
        return sendText(
          res,
          502,
          `The ${channel} site redirected ${url.pathname} to an unsafe path on ${origin}; foliwake dev does not ` +
            `follow it.\n`,
          method,
        );
      return sendError(res, 502, method, 'Redirect to an unsafe path refused', [
        `${channel} at ${origin} redirected ${url.pathname} to a path that is not a page or media path (for example ` +
          `//host/…).`,
        'foliwake dev --remote only redirects to page and /media paths on this local origin.',
      ]);
    }
    const where = next ? next.origin : 'an invalid location';
    if (kind === 'media')
      return sendText(
        res,
        502,
        `The ${channel} site redirected ${url.pathname} to ${where}; foliwake dev only reads from ${origin}.\n`,
        method,
      );
    return sendError(res, 502, method, `Redirect to another origin refused`, [
      `${channel} at ${origin} redirected ${url.pathname} to ${where}.`,
      'foliwake dev --remote never follows redirects to another origin and never sends the credentials there.',
      `Check the configured URL in ${target.from}.`,
    ]);
  }

  async function descriptorState(): Promise<{ descriptor: LocalDescriptor | null; diagnostics: Diagnostic[] }> {
    const [descriptor, diagnostics] = await Promise.all([readLocalDescriptor(cwd), descriptorDiagnostics(cwd)]);
    return { descriptor, diagnostics };
  }

  function report(pathname: string, problems: readonly DevProblem[]): void {
    const text = problems.map(formatProblem).join('\n');
    if ((reported.get(pathname) ?? '') === text) return;
    reported.set(pathname, text);
    if (text) say(`${pathname}: the local frontend cannot render this ${channel} page completely:\n${text}`);
    else say(`${pathname}: compatible again.`);
  }

  async function renderRemote(page: RemotePage, pathname: string, banner: string | null): Promise<string> {
    const { descriptor, diagnostics } = await descriptorState();
    const problems = compatibilityProblems({ page, descriptor, descriptorDiagnostics: diagnostics });
    report(pathname, problems);
    const bannerHtml = [
      banner ? noticeBanner(banner) : '',
      problems.length
        ? problemsBanner(
            `foliwake dev: ${problems.length} problem(s) between this ${channel} page and the local frontend; the ` +
              `content is shown below.`,
            problems,
          )
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    const contract = Number(page.htmlContract);
    return renderPageShell({
      page: { title: page.title, description: page.description, body: page.body },
      lang: page.lang ?? 'en',
      htmlContract: Number.isInteger(contract) && contract > 0 ? contract : HTML_CONTRACT,
      devBanner: bannerHtml,
      componentCss: shellStylesheets(page.components, descriptor),
    });
  }

  async function servePage(
    req: IncomingMessage,
    res: ServerResponse,
    rawPath: string,
    query: string,
    method: Method,
    signal: AbortSignal,
    cancelled: () => boolean,
  ): Promise<void> {
    const url = remoteUrl(origin, rawPath, query);
    if (!url) throw new NotFound();
    let response: Response;
    try {
      response = await fetchRemote(url, 'page', req, signal);
    } catch (error) {
      if (cancelled()) return dropCancelled(res);
      return sendError(res, 502, method, `${channel} unavailable`, [
        `${channel} unavailable at ${origin}: ${errorReason(error)}.`,
        `Nothing else is tried (no fallback to ${channel === 'preview' ? 'live' : 'preview'}). Check that the site ` +
          `is up, then refresh.`,
      ]);
    }
    const remote = pickRemoteHeaders(response.headers);
    const status = response.status;
    if (REDIRECT_STATUSES.has(status)) return redirect(res, response, url, method, 'page');
    if (status === 401 || status === 403) {
      void response.body?.cancel().catch(() => {});
      return sendError(res, status, method, `Authentication failed`, [
        `authentication failed for ${channel} at ${origin} (HTTP ${status}): ${authHint}.`,
      ]);
    }
    let bytes: Buffer;
    try {
      bytes = await readLimited(response, MAX_PAGE_BYTES);
    } catch (error) {
      if (cancelled()) return dropCancelled(res);
      if (error instanceof TooLarge)
        return sendError(res, 502, method, 'Remote page too large', [
          `${channel} at ${origin} returned more than ${MAX_PAGE_BYTES} bytes for ${url.pathname}.`,
        ]);
      return sendError(res, 502, method, `${channel} unavailable`, [
        `${channel} unavailable at ${origin}: ${errorReason(error)} while reading ${url.pathname}.`,
      ]);
    }
    const html = bytes.toString('utf8');
    const isHtml = /^text\/html\b/i.test(response.headers.get('content-type') ?? '');
    if (status >= 500) {
      return sendError(
        res,
        502,
        method,
        `${channel} unavailable`,
        [
          `${channel} unavailable at ${origin}: HTTP ${status} for ${url.pathname}.`,
          `Nothing else is tried (no fallback to ${channel === 'preview' ? 'live' : 'preview'}).`,
        ],
        isHtml ? remoteText(html) : html.slice(0, 4000),
        remote,
      );
    }
    if (status === 404) {
      const page = isHtml ? extractRemotePage(html) : null;
      const body = page
        ? page.body
        : `<h1>Not found</h1>\n<p>${escapeHtml(isHtml ? remoteText(html) : html.trim().slice(0, 400))}</p>`;
      const shown: RemotePage = page ?? {
        lang: null,
        htmlContract: String(HTML_CONTRACT),
        title: 'Not found',
        description: null,
        body,
        components: [],
      };
      say(`${channel} ${url.pathname}: 404 not found at ${origin}`);
      return sendHtml(
        res,
        404,
        await renderRemote(
          shown,
          url.pathname,
          `${channel} at ${origin} has no page at ${url.pathname}${url.search} (HTTP 404). Unpublished pages are on ` +
            `preview only.`,
        ),
        method,
        remote,
      );
    }
    if (status !== 200) {
      const lines =
        status === 409
          ? [
              `${channel} at ${origin} cannot serve ${url.pathname} with its current code (HTTP 409). Its own ` +
                `explanation follows.`,
            ]
          : [`${channel} at ${origin} answered HTTP ${status} for ${url.pathname}.`];
      return sendError(
        res,
        status >= 400 && status < 500 ? status : 502,
        method,
        status === 409 ? 'Remote page incompatible (409)' : `Remote answered ${status}`,
        lines,
        isHtml ? remoteText(html) : html.slice(0, 4000),
        remote,
      );
    }
    if (!isHtml)
      return sendError(res, 502, method, 'Not an HTML page', [
        `${channel} at ${origin} returned ${response.headers.get('content-type') ?? 'no content type'} for ` +
          `${url.pathname}, not an HTML page.`,
      ]);
    const page = extractRemotePage(html);
    if (!page) {
      return sendError(res, 502, method, 'Not a Foliwake page', [
        `The ${channel} document at ${origin}${url.pathname} has no <main> element.`,
        `Check the configured URL in ${target.from}: it must be the Foliwake origin.`,
      ]);
    }
    sendHtml(res, 200, await renderRemote(page, url.pathname, null), method, remote);
  }

  async function serveMedia(
    req: IncomingMessage,
    res: ServerResponse,
    rawPath: string,
    method: Method,
    signal: AbortSignal,
    cancelled: () => boolean,
  ): Promise<void> {
    const url = remoteUrl(origin, rawPath, '');
    if (!url) throw new NotFound();
    let response: Response;
    try {
      response = await fetchRemote(url, 'media', req, signal);
    } catch (error) {
      if (cancelled()) return dropCancelled(res);
      say(`${channel} unavailable at ${origin} for ${rawPath}: ${errorReason(error)}`);
      return sendText(res, 502, `${channel} unavailable at ${origin}: ${errorReason(error)}.\n`, method);
    }
    const status = response.status;
    if (REDIRECT_STATUSES.has(status)) return redirect(res, response, url, method, 'media');
    if (status !== 200) {
      void response.body?.cancel().catch(() => {});
      if (status === 401 || status === 403) {
        say(`authentication failed for ${channel} at ${origin} (HTTP ${status}) for ${rawPath}: ${authHint}`);
        return sendText(res, status, `authentication failed for ${channel} at ${origin}: ${authHint}.\n`, method);
      }
      if (status === 404) return sendText(res, 404, `Not found on ${channel} at ${origin}.\n`, method);
      say(`${channel} at ${origin}: HTTP ${status} for ${rawPath}`);
      return sendText(res, 502, `${channel} at ${origin} answered HTTP ${status}.\n`, method);
    }
    const extension = rawPath.slice(rawPath.lastIndexOf('.') + 1);
    const expected = MEDIA_TYPES[extension];
    const declared = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (declared && declared !== expected) {
      void response.body?.cancel().catch(() => {});
      return sendText(
        res,
        502,
        `${channel} at ${origin} returned ${declared} for a .${extension} media file.\n`,
        method,
      );
    }
    let bytes: Buffer;
    try {
      bytes = await readLimited(response, MAX_MEDIA_BYTES);
    } catch (error) {
      if (cancelled()) return dropCancelled(res);
      return sendText(
        res,
        502,
        error instanceof TooLarge
          ? 'Media file too large.\n'
          : `${channel} unavailable at ${origin}: ${errorReason(error)}.\n`,
        method,
      );
    }
    send(
      res,
      200,
      {
        'Content-Type': expected,
        'Content-Length': bytes.length,
        'Cache-Control': REMOTE_MEDIA_CACHE,
        'X-Foliwake-Remote': channel,
      },
      bytes,
      method,
    );
  }

  async function serveDiagnostics(res: ServerResponse, method: Method): Promise<void> {
    const { diagnostics } = await descriptorState();
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    const auth = target.auth
      ? `user "${target.auth.username}", password from ${target.auth.passwordEnv}`
      : 'no credentials';
    sendHtml(
      res,
      200,
      renderDiagnosticsPage({
        title: `Remote ${channel}: ${origin}`,
        intro:
          `Content from ${channel} at ${origin} (${target.from}; ${auth}); code from this checkout. ` +
          `${DESCRIPTOR_PATH}: ${diagnostics.length} diagnostic(s), ${errors} error(s).`,
        diagnostics,
      }),
      method,
    );
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method;
    if (reload) generations.set(res, reload.generation());
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;
    const allowed = checkLocalRequest({ host: req.headers.host, origin: req.headers.origin }, port);
    if (!allowed.ok) return sendText(res, allowed.status, allowed.message, method);
    const rawUrl = req.url ?? '/';
    const rawPath = rawUrl.split(/[?#]/, 1)[0] || '/';
    const queryIndex = rawUrl.indexOf('?');
    const query = queryIndex >= 0 ? rawUrl.slice(queryIndex + 1).split('#', 1)[0] : '';
    if (reload && rawPath === DEV_EVENTS_PATH) {
      if (method !== 'GET') return sendText(res, 405, 'Method not allowed\n', method, { Allow: 'GET' });
      return reload.handleEvents(req, res);
    }
    if (method !== 'GET' && method !== 'HEAD')
      return sendText(res, 405, 'Method not allowed\n', method, { Allow: 'GET, HEAD' });
    const route = classifyRemoteRoute(rawPath);
    try {
      switch (route.kind) {
        case 'code':
          return await serveCodeFile(res, cwd, route.prefix, route.rest, method);
        case 'media':
          return await withUpstreamSignal(res, (signal, cancelled) =>
            serveMedia(req, res, route.path, method, signal, cancelled),
          );
        case 'deployed-code':
          return sendText(res, 404, DEPLOYED_CODE_TEXT, method);
        case 'dev':
          if (rawPath === '/_dev/diagnostics') return await serveDiagnostics(res, method);
          if (
            rawPath === BLOCK_CATALOG_PATH ||
            rawPath.startsWith(`${BLOCK_CATALOG_PATH}/`) ||
            rawPath === '/_dev/blocks'
          ) {
            return sendHtml(res, 501, blockCatalogStub(), method);
          }
          if (reload && rawPath === DEV_CLIENT_PATH)
            return send(res, 200, { 'Content-Type': 'text/javascript; charset=utf-8' }, DEV_CLIENT_SCRIPT, method);
          throw new NotFound();
        case 'page':
          return await withUpstreamSignal(res, (signal, cancelled) =>
            servePage(req, res, route.path, query, method, signal, cancelled),
          );
        default:
          throw new NotFound();
      }
    } catch (error) {
      if (
        error instanceof NotFound ||
        (error as NodeJS.ErrnoException)?.code === 'ENOENT' ||
        (error as NodeJS.ErrnoException)?.code === 'EISDIR'
      ) {
        return sendHtml(
          res,
          404,
          renderRemoteErrorPage({
            title: 'Not found',
            lines: [
              `${rawPath} is not served by foliwake dev --remote (local files: components/, scripts/, styles/; ` +
                `remote: pages and /media/<sha256>.<ext>).`,
            ],
          }),
          method,
        );
      }
      say(`internal error for ${rawPath}: ${(error as Error)?.stack ?? String(error)}`);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      return sendText(res, 500, 'Internal server error; see the terminal.\n', method);
    }
  }

  const server: RemoteDevServer = http.createServer((req, res) => {
    void handle(req, res);
  });
  // Stopping the server also cancels the remote requests still in progress.
  const close = server.close.bind(server);
  server.close = ((callback?: (error?: Error) => void) => {
    abortActive();
    return close(callback);
  }) as typeof server.close;
  return server;
}

/** startRemoteDevServer() options. */
export interface StartRemoteDevServerOptions extends Omit<RemoteDevServerOptions, 'reload'> {
  port: number;
  /** `--watch`: reload open pages after changes of local code (components/, scripts/, styles/). */
  liveReload?: boolean | LiveReloadOptions;
}

/**
 * Starts remote mode on 127.0.0.1. With `liveReload`, only local code is
 * watched (the remote site is never polled); a reload fetches the page again.
 * server.close() stops the event streams at once and the watchers after it.
 */
export async function startRemoteDevServer({
  port,
  liveReload = false,
  ...options
}: StartRemoteDevServerOptions): Promise<RemoteDevServer> {
  const log = options.log ?? ((text: string) => process.stderr.write(text + '\n'));
  const redact = options.redact ?? ((t: string) => t);
  const live = liveReload === false ? null : liveReload === true ? {} : liveReload;
  let reload: ReloadHub | undefined;
  if (live) {
    const checker = createDevChecker({ cwd: options.cwd });
    reload = createReloadHub({
      ...(live.debounceMs === undefined ? {} : { debounceMs: live.debounceMs }),
      log: (text) => log(redact(`${TAG} ${text}`)),
      check: () => checker.check(),
    });
  }
  const server = createRemoteDevServer({ ...options, ...(reload ? { reload } : {}) });
  if (reload) server.reload = reload;
  const stops: Array<() => Promise<void> | void> = [];
  let stopping: Promise<void> | null = null;
  const stopAll = (): Promise<void> => {
    stopping ??= Promise.allSettled(stops.map((stop) => stop())).then(() => undefined);
    return stopping;
  };
  let resolveStopped: () => void = () => {};
  server.stopped = new Promise<void>((resolve) => (resolveStopped = resolve));
  server.once('close', () => setImmediate(() => void stopAll().then(resolveStopped)));
  const originalClose = server.close.bind(server);
  server.close = ((callback?: (error?: Error) => void) => {
    reload?.stop();
    return originalClose(callback);
  }) as typeof server.close;

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LISTEN_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
  try {
    if (live && reload) {
      const hub = reload;
      const code = createLiveCodeWatcher({
        cwd: options.cwd,
        ...(live.polling === undefined ? {} : { polling: live.polling }),
        ...(live.codePollingIntervalMs === undefined ? {} : { pollingIntervalMs: live.codePollingIntervalMs }),
        log: (line) => log(redact(`${TAG} ${line}`)),
        onChange: (files) => hub.notify(files),
        onError: (error) => log(redact(`${TAG} code watching: ${(error as Error)?.message ?? String(error)}`)),
      });
      stops.push(() => code.stop());
      await code.start();
      const initial = await hub.refresh();
      if (initial.length)
        log(
          redact(
            `${TAG} ${initial.length} problem(s) in the local code; open pages show them until they are ` +
              `fixed:\n${initial.map(formatProblem).join('\n')}`,
          ),
        );
    } else {
      const diagnostics = await descriptorDiagnostics(options.cwd);
      const errors = diagnostics.filter((d) => d.severity === 'error').map(toProblem);
      if (errors.length)
        log(
          redact(`${TAG} ${DESCRIPTOR_PATH} has ${errors.length} error(s):\n${errors.map(formatProblem).join('\n')}`),
        );
    }
  } catch (error) {
    reload?.stop();
    await new Promise<void>((resolve) => originalClose(() => resolve()));
    await server.stopped;
    throw error;
  }
  return server;
}
