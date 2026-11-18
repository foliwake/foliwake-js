// Browser auto-reload for `foliwake dev --watch` (no hot module replacement).
//
// The pieces do not depend on where page HTML comes from, so any dev page
// source can reuse them:
// - createReloadHub(): a debounced change notifier. notify(files) any number
//   of times; after `debounceMs` without further changes it runs `check()`
//   once (the current problems) and sends ONE `reload` event to every open
//   event stream.
// - hub.handleEvents(): the Server-Sent Events endpoint (DEV_EVENTS_PATH).
//   A new stream first gets `hello` (server id, change generation, current
//   problems). Every flush increments the generation. The page carries the
//   generation it was rendered at (data-generation on the client script tag),
//   so a client reloads when `hello` shows another server id OR another
//   generation: changes made while the stream was disconnected, or between
//   rendering the page and connecting, are never missed.
// - injectDevClient(): the single injection point; adds the client script
//   (DEV_CLIENT_PATH, DEV_CLIENT_SCRIPT) to an HTML document.
// - hub.stop(): sends `bye`, ends every stream and clears the timer, so
//   `server.close()` is not held open by event streams.

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const DEV_EVENTS_PATH = '/_dev/events';
export const DEV_CLIENT_PATH = '/_dev/reload.js';
export const DEFAULT_RELOAD_DEBOUNCE_MS = 200;

/** One problem shown in the browser overlay and in the terminal (project-relative file only). */
export interface DevProblem {
  file: string;
  line: number | null;
  column: number | null;
  code: string;
  message: string;
  fix: string | null;
}

export interface ReloadHubOptions {
  /** quiet window that merges several saves into one reload (default 200 ms) */
  debounceMs?: number;
  /** the current problems (descriptor, module syntax, content errors); called once per flush */
  check: () => Promise<DevProblem[]>;
  log?: (text: string) => void;
}

export interface ReloadEvent {
  files: string[];
  problems: DevProblem[];
  /** change generation after this flush (starts at 0, +1 per flush) */
  generation: number;
}

export interface ReloadHub {
  readonly serverId: string;
  /** The current change generation: 0 at start, +1 for every flushed (sent) change set. */
  generation(): number;
  /** Files changed (cwd-relative posix); merged into the next debounced reload. */
  notify(files: readonly string[]): void;
  /** Computes the problems now (startup baseline); later streams get them in `hello`. */
  refresh(): Promise<DevProblem[]>;
  problems(): DevProblem[];
  handleEvents(req: IncomingMessage, res: ServerResponse): void;
  /** Open event streams (tests). */
  clientCount(): number;
  /** Resolves after each reload is sent (tests and logs). */
  onReload(listener: (event: ReloadEvent) => void): () => void;
  stop(): void;
}

export function formatProblem(p: DevProblem): string {
  const where = p.line == null ? p.file : `${p.file}:${p.line}${p.column == null ? '' : `:${p.column}`}`;
  return `  ${where} ${p.code} ${p.message}${p.fix ? `\n    Fix: ${p.fix}` : ''}`;
}

export function createReloadHub({
  debounceMs = DEFAULT_RELOAD_DEBOUNCE_MS,
  check,
  log = () => {},
}: ReloadHubOptions): ReloadHub {
  const serverId = randomUUID();
  const clients = new Set<ServerResponse>();
  const listeners = new Set<(event: ReloadEvent) => void>();
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let flushing: Promise<void> | null = null;
  let current: DevProblem[] = [];
  let ready: Promise<DevProblem[]> | null = null;
  let stopped = false;
  let generation = 0;

  function write(res: ServerResponse, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  async function refresh(): Promise<DevProblem[]> {
    const run = (async () => {
      try {
        current = await check();
      } catch (error) {
        current = [
          {
            file: '(dev server)',
            line: null,
            column: null,
            code: 'DEV_CHECK_FAILED',
            message: `The change check failed: ${(error as Error)?.message ?? String(error)}`,
            fix: 'See the terminal; save the file again after fixing it.',
          },
        ];
      }
      return current;
    })();
    ready = run;
    return run;
  }

  async function flush(): Promise<void> {
    const files = [...pending].sort();
    pending.clear();
    const before = current.length;
    const problems = await refresh();
    if (stopped) return;
    generation += 1;
    const event: ReloadEvent = { files, problems, generation };
    for (const res of clients) write(res, 'reload', event);
    const changed =
      files.length > 5 ? `${files.slice(0, 5).join(', ')} and ${files.length - 5} more` : files.join(', ');
    if (problems.length)
      log(
        `Changed: ${changed}. ${problems.length} problem(s); the browser shows ` +
          `them:\n${problems.map(formatProblem).join('\n')}`,
      );
    else log(`Changed: ${changed}. ${before ? 'Problems fixed; ' : ''}reloading ${clients.size} browser page(s).`);
    for (const listener of listeners) listener(event);
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      // A change arriving during a flush is sent by the next flush.
      const run = (flushing ?? Promise.resolve()).then(flush);
      flushing = run.finally(() => {
        if (flushing === run) flushing = null;
      });
    }, debounceMs);
  }

  return {
    serverId,
    generation: () => generation,
    notify(files) {
      if (stopped) return;
      for (const file of files) pending.add(file);
      schedule();
    },
    refresh,
    problems: () => current,
    handleEvents(req, res) {
      if (stopped) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('The dev server is stopping.\n');
        return;
      }
      // Same origin only: no Access-Control-* headers. `Connection: close`
      // makes ending the stream also close its socket (prompt server.close()).
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        Connection: 'close',
      });
      res.write('retry: 1000\n\n');
      clients.add(res);
      const drop = (): void => {
        clients.delete(res);
      };
      req.on('close', drop);
      res.on('close', drop);
      void (ready ?? refresh()).then(() => {
        if (clients.has(res)) write(res, 'hello', { serverId, generation, problems: current });
      });
    },
    clientCount: () => clients.size,
    onReload(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
      for (const res of clients) {
        try {
          write(res, 'bye', { serverId });
          res.end();
        } catch {
          res.destroy();
        }
      }
      clients.clear();
    },
  };
}

/**
 * The one place a dev client is added to an HTML document (any dev page source).
 * `generation` is the hub's change generation when the document was produced;
 * the client reloads when the server's generation differs after (re)connecting.
 */
export function injectDevClient(html: string, generation: number | null = null): string {
  const attr =
    Number.isSafeInteger(generation) && (generation as number) >= 0 ? ` data-generation="${generation}"` : '';
  const tag = `<script src="${DEV_CLIENT_PATH}"${attr} defer></script>`;
  const head = html.search(/<\/head>/i);
  if (head >= 0) return `${html.slice(0, head)}  ${tag}\n${html.slice(head)}`;
  return `${tag}\n${html}`;
}

// The browser client: reloads on `reload`, shows server problems (descriptor,
// module syntax, content errors), problems embedded in the page by the server
// (<script type="application/json" data-foliwake-dev-problems>) and browser problems (failed script or
// stylesheet loads, uncaught errors, components the loader marked as failed)
// in an overlay. Plain ES2017, no dependencies; its only globals are a guard and a
// connected flag (tests wait for it).
export const DEV_CLIENT_SCRIPT = `// foliwake dev --watch: reload after changes, show problems.
(function () {
  'use strict';
  if (window.__foliwakeDevClient) return;
  window.__foliwakeDevClient = true;
  var serverId = null;
  // The change generation this page was rendered at (null: unknown, e.g. an
  // older tag); compared with every hello so changes made while disconnected
  // are not missed.
  var pageGeneration = (function () {
    var s = document.currentScript;
    var g = s && s.getAttribute('data-generation');
    return g != null && /^\\d+$/.test(g) ? Number(g) : null;
  })();
  var source = null;
  var attempts = 0;
  var serverProblems = [];
  var browserProblems = [];
  var dismissed = false;

  function rel(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin === location.origin ? u.pathname.replace(/^\\//, '') : u.href;
    } catch (e) { return String(url); }
  }
  function addBrowserProblem(p) {
    var key = p.file + '|' + p.message;
    for (var i = 0; i < browserProblems.length; i++) if (browserProblems[i].key === key) return;
    p.key = key;
    browserProblems.push(p);
    render();
  }
  function el(tag, text, style) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (style) e.setAttribute('style', style);
    return e;
  }
  function render() {
    var all = serverProblems.concat(browserProblems);
    var old = document.querySelector('[data-foliwake-dev-overlay]');
    if (old) old.remove();
    if (!all.length || dismissed || !document.body) return;
    var box = el('div', null, 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:50vh;' +
      'overflow:auto;background:#fff5f5;color:#1b1b1b;border-top:4px solid #b00020;' +
      'font:14px/1.45 system-ui,sans-serif;padding:12px 16px;box-shadow:0 -4px 16px rgba(0,0,0,.2)');
    box.setAttribute('data-foliwake-dev-overlay', '');
    box.setAttribute('role', 'alert');
    var close = el('button', 'Dismiss', 'float:right;font:inherit');
    close.type = 'button';
    close.addEventListener('click', function () { dismissed = true; render(); });
    box.appendChild(close);
    box.appendChild(el('strong', 'foliwake dev: ' + all.length + ' problem(s)'));
    var list = el('ol', null, 'margin:6px 0;padding-left:20px');
    all.forEach(function (p) {
      var li = el('li', null, 'margin:0 0 6px');
      li.setAttribute('data-file', p.file);
      var where = p.file + (p.line != null ? ':' + p.line + (p.column != null ? ':' + p.column : '') : '');
      li.appendChild(el('code', where, 'font:13px ui-monospace,Menlo,monospace;font-weight:600'));
      li.appendChild(document.createTextNode(' ' + (p.code ? p.code + ': ' : '') + p.message));
      if (p.fix) li.appendChild(el('div', 'Fix: ' + p.fix));
      list.appendChild(li);
    });
    box.appendChild(list);
    var after = 'Fix the file and save it: the page reloads by itself. All diagnostics: /_dev/diagnostics';
    box.appendChild(el('div', after, 'color:#555'));
    document.body.appendChild(box);
  }

  window.addEventListener('error', function (event) {
    var t = event.target;
    if (t && t !== window && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
      var url = t.src || t.href;
      addBrowserProblem({
        file: rel(url), line: null, column: null, code: 'DEV_LOAD_FAILED',
        message: (t.tagName === 'SCRIPT' ? 'Script' : 'Stylesheet') + ' failed to load.',
        fix: 'Check that the file exists and is served (see the terminal).'
      });
      return;
    }
    addBrowserProblem({
      file: event.filename ? rel(event.filename) : '(page)', line: event.lineno || null,
      column: event.colno || null, code: 'DEV_SCRIPT_ERROR', message: String(event.message || 'Uncaught error'),
      fix: null
    });
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var r = event.reason;
    addBrowserProblem({
      file: '(page)', line: null, column: null, code: 'DEV_UNHANDLED_REJECTION',
      message: String(r && r.message ? r.name + ': ' + r.message : r), fix: null
    });
  });
  function scanComponents(root) {
    var scope = root || document;
    var failed = scope.querySelectorAll ? scope.querySelectorAll('[data-component-status="error"]') : [];
    for (var i = 0; i < failed.length; i++) {
      var name = failed[i].getAttribute('data-component') || '?';
      addBrowserProblem({
        file: 'components/' + name, line: null, column: null, code: 'DEV_COMPONENT_FAILED',
        message: 'Component "' + name + '" failed in the browser; the console has the loader error.',
        fix: 'Fix the component files (or components/components.json) and save.'
      });
    }
  }
  // Problems the server found in this page itself (for example a remote page
  // that the local components cannot render with foliwake dev --remote).
  function pageProblems() {
    var blocks = document.querySelectorAll('script[type="application/json"][data-foliwake-dev-problems]');
    for (var i = 0; i < blocks.length; i++) {
      var list;
      try { list = JSON.parse(blocks[i].textContent || '[]'); } catch (e) { continue; }
      if (!Array.isArray(list)) continue;
      list.forEach(function (p) {
        if (!p || typeof p.message !== 'string') return;
        addBrowserProblem({
          file: String(p.file || '(page)'), line: p.line == null ? null : p.line,
          column: p.column == null ? null : p.column, code: String(p.code || ''), message: p.message,
          fix: p.fix == null ? null : String(p.fix)
        });
      });
    }
  }
  function observe() {
    pageProblems();
    scanComponents(document);
    var watched = { subtree: true, attributes: true, attributeFilter: ['data-component-status'] };
    new MutationObserver(function () { scanComponents(document); }).observe(document.documentElement, watched);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe); else observe();

  function reconnectLater() {
    window.__foliwakeDevConnected = false;
    if (source) source.close();
    source = null;
    attempts++;
    if (attempts > 60) return; // about 10 minutes, then stop; refresh by hand
    setTimeout(connect, Math.min(1000 * Math.pow(2, attempts - 1), 10000));
  }
  function connect() {
    source = new EventSource('${DEV_EVENTS_PATH}');
    source.addEventListener('hello', function (e) {
      var data = JSON.parse(e.data);
      if (serverId && data.serverId !== serverId) { location.reload(); return; }
      if (typeof data.generation === 'number') {
        if (pageGeneration !== null && data.generation !== pageGeneration) { location.reload(); return; }
        // An established connection without a page generation adopts the server's.
        if (pageGeneration === null && serverId) { location.reload(); return; }
        pageGeneration = data.generation;
      }
      serverId = data.serverId;
      attempts = 0;
      window.__foliwakeDevConnected = true;
      serverProblems = data.problems || [];
      render();
    });
    source.addEventListener('reload', function () { location.reload(); });
    source.addEventListener('bye', function () { reconnectLater(); });
    // Our own bounded backoff instead of EventSource's endless 1 s retries.
    source.onerror = function () { reconnectLater(); };
  }
  connect();
})();
`;
