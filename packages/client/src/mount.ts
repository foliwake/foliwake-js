// mountFoliwakePage: shows a prepared page body in a DOM element and mounts its blocks from the page's own code
// release. Every framework adapter (@foliwake/react's <FoliwakePage>, a Vue or Svelte component, a web
// component) is a wrapper around this function.
//
// Invariants (docs/plan/react-packages.md §6.2):
//  1. page.identity is the mount's identity (it includes a digest of the final prepared body): a new body,
//     code release, channel or mode is a new mount
//     (`update({ page })` with another identity disposes and mounts again); nothing else remounts.
//  2. Callbacks and host members are read from the latest options at call time (`update()`; latest wins).
//  3. Every async step checks the mount's AbortSignal first; nothing runs after dispose.
//  4. Dispose is idempotent: abort, remove listeners, handle.dispose(), release CSS. No callback after it.
//  5. mount → dispose → mount on the same element starts from the pristine body (StrictMode, Fast Refresh,
//     a framework that keeps the element): the second mount restores page.html.
//  6. Block CSS is counted per code release (css-registry.ts).
import type { BlockReport, BlocksModule, FoliwakeEvent, MountHandle } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';
import { acquireCss } from './css-registry.js';
import { isDevelopment } from './dev.js';
import { listenBlockEvents } from './events.js';
import { createHost, type HostInit } from './host.js';
import { importBlocksModule } from './load.js';

export type FoliwakePageStatus = 'mounting' | 'ready' | 'partial' | 'static' | 'error';
export interface FoliwakePageError {
  code: string;
  message: string;
}

/** The lifecycle phases a hook can run in, in phase order. */
export const HOOK_PHASES = Object.freeze(['beforeBlocks', 'afterFirstSection', 'lazy', 'delayed'] as const);
export type FoliwakeHookPhase = (typeof HOOK_PHASES)[number];
export interface FoliwakeHookContext {
  phase: FoliwakeHookPhase;
  container: HTMLElement;
  page: FoliwakePageData;
  /** Aborted on dispose: a hook stops its work. */
  signal: AbortSignal;
}
export type FoliwakeHook = (context: FoliwakeHookContext) => void | Promise<void>;
export type FoliwakePhaseHooks = { [P in FoliwakeHookPhase]?: FoliwakeHook };
/**
 * Lifecycle hooks (extension point; the full hooks contract comes later). In each phase the site's hook runs
 * before the template's; a hook's promise is awaited before the next one, raced against the mount's signal (a
 * slow hook never holds up dispose). A failing hook is reported (`onError` HOOK_FAILED) and the lifecycle goes
 * on. No hook starts after dispose, but a hook already running is not stopped: cancellation is cooperative,
 * so a hook checks `signal.aborted` after each await and cleans up what it started (the same element may
 * already hold the next page's mount).
 * 0.1 timing: `beforeBlocks` after the module loaded and passed the contract check, before `mountBlocks`;
 * `afterFirstSection` right after `mountBlocks` returned (a body is one section in 0.1); `lazy` once
 * `handle.ready` settled; `delayed` after `lazy`, on a later task.
 */
export interface FoliwakeHooks {
  site?: FoliwakePhaseHooks;
  template?: FoliwakePhaseHooks;
}

/** What may change during a mount (`update()`); read at call time. */
export interface FoliwakeMountCallbacks {
  /** The app's part of the block host; a function is called at every member read. */
  host?: HostInit | (() => HostInit);
  onEvent?: (event: FoliwakeEvent) => void;
  /** Without blocks the page is `error` instead of `static`. */
  requireBlocks?: boolean;
  onStatus?: (status: FoliwakePageStatus, reports?: BlockReport[]) => void;
  onError?: (error: FoliwakePageError) => void;
  /** Imperative app logic on the mounted container (slides, focus). */
  onMount?: (container: HTMLElement, handle: MountHandle) => void;
  /** Lifecycle hooks by phase, site-level then template-level (FoliwakeHooks). */
  hooks?: FoliwakeHooks;
}

export interface FoliwakeMountOptions extends FoliwakeMountCallbacks {
  page: FoliwakePageData;
  /**
   * The body in the element before blocks mount. `'auto'` (default): insert `page.html` when the element is
   * empty or was mounted before (a remount starts pristine), keep server-rendered or framework-rendered HTML
   * otherwise. `'insert'`: always insert. `'keep'`: never touch it (the caller restores it).
   */
  body?: 'auto' | 'insert' | 'keep';
  /** Add `<link rel="stylesheet">` for the body's blocks to <head>, owned by the CSS count (default false). */
  stylesheets?: boolean;
  /** `host.shell` when the app's host names none (default 'web'). */
  shell?: string;
  /** Build-time mode (later): the blocks module from the app's bundle instead of the code release. */
  blocks?: () => Promise<BlocksModule>;
  /** Aborting it disposes the mount. */
  signal?: AbortSignal;
}

export interface FoliwakeMount {
  readonly element: HTMLElement;
  readonly page: FoliwakePageData;
  /** The last status reported; 'disposed' after dispose. */
  readonly status: FoliwakePageStatus | 'idle' | 'disposed';
  /** New callbacks or host (latest wins, no remount); a `page` with another identity remounts. */
  update(next: FoliwakeMountCallbacks & { page?: FoliwakePageData }): void;
  /** Idempotent. Leaves the DOM as it is; no callback runs after it. */
  dispose(): void;
}

/** The key a framework adapter remounts on (its `key`): site, channel, path, ETag, code release, mode and a digest of the final body and its mount settings. */
export function pageIdentity(page: FoliwakePageData): string {
  return page.identity;
}

/** The stylesheets of the body's blocks in its code release (for an adapter that renders them with the body). */
export function pageStylesheets(page: FoliwakePageData): { name: string; href: string; codeRelease: string }[] {
  if (!page.codeBase || !page.codeRelease) return [];
  const { codeBase, codeRelease } = page;
  return page.blocks.map((name) => ({ name, href: `${codeBase}components/${name}/${name}.css`, codeRelease }));
}

// Elements a mount has started on: a later mount on one of them restores the pristine body (invariant 5).
const mountedOnce = new WeakSet<Element>();

interface Session {
  status: FoliwakePageStatus | 'idle';
  dispose(): void;
}

/** Shows `options.page` in `element` and mounts its blocks. */
export function mountFoliwakePage(element: HTMLElement, options: FoliwakeMountOptions): FoliwakeMount {
  let opts: FoliwakeMountOptions = { ...options };
  const external = options.signal;
  // An already aborted signal: nothing starts (no body change, no import, no callback).
  let disposed = external?.aborted === true;
  let session: Session = { status: 'idle', dispose() {} };
  // start() registers its session before it calls any app callback, so a dispose(), an external abort or an
  // update() from inside a callback always reaches the session that is running (never a stale one).
  const begin = () => start(element, () => opts, opts.page, (created) => (session = created));

  const mount: FoliwakeMount = {
    element,
    get page() {
      return opts.page;
    },
    get status() {
      return disposed ? 'disposed' : session.status;
    },
    update(next) {
      if (disposed) return;
      const remount = next.page !== undefined && next.page.identity !== opts.page.identity;
      opts = { ...opts, ...next };
      if (remount) {
        session.dispose();
        begin();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      external?.removeEventListener('abort', onAbort);
      session.dispose();
    },
  };
  const onAbort = () => mount.dispose();
  if (!disposed) {
    // The external signal is watched before anything runs, so an abort from the first callback is seen.
    external?.addEventListener('abort', onAbort, { once: true });
    begin();
  }
  return mount;
}

function start(container: HTMLElement, latest: () => FoliwakeMountOptions, page: FoliwakePageData, register: (session: Session) => void): Session {
  const controller = new AbortController();
  const { signal } = controller;
  let handle: MountHandle | null = null;
  let stopEvents: (() => void) | null = null;
  let releaseCss: (() => void) | null = null;
  let disposed = false;
  const session: Session = {
    status: 'idle',
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      stopEvents?.();
      try {
        handle?.dispose();
      } catch (error) {
        console.error('[foliwake] dispose failed', error);
      }
      releaseCss?.();
    },
  };
  register(session);
  const aborted = new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));

  const status = (s: FoliwakePageStatus, reports?: BlockReport[]) => {
    if (signal.aborted) return;
    session.status = s;
    latest().onStatus?.(s, reports);
  };
  const fail = (code: string, message: string) => {
    if (signal.aborted) return;
    latest().onError?.({ code, message });
    status(latest().requireBlocks ? 'error' : 'static');
  };
  // The phase's hooks, site then template, each awaited; read from the latest options at call time.
  const runHooks = async (phase: FoliwakeHookPhase) => {
    for (const level of ['site', 'template'] as const) {
      if (signal.aborted) return;
      const hook = latest().hooks?.[level]?.[phase];
      if (!hook) continue;
      try {
        // Raced against the mount's signal: a slow hook never holds up dispose or the next mount. The hook
        // itself is cooperative: it gets the signal and must check it after each await (README, "hooks").
        await Promise.race([hook({ phase, container, page, signal }), aborted]);
      } catch (error) {
        if (!signal.aborted) latest().onError?.({ code: 'HOOK_FAILED', message: `${level} ${phase} hook: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
  };
  const holdCss = () => {
    if (page.codeRelease && !releaseCss) releaseCss = acquireCss(container.ownerDocument, page.codeRelease);
  };

  const { body = 'auto', stylesheets = false } = latest();
  if (body === 'insert' || (body === 'auto' && (mountedOnce.has(container) || !container.hasChildNodes()))) container.innerHTML = page.html;
  mountedOnce.add(container);
  if (!container.hasAttribute('data-foliwake-body')) container.setAttribute('data-foliwake-body', '');
  if (!container.hasAttribute('data-html-contract')) container.setAttribute('data-html-contract', page.htmlContract);
  if (stylesheets) {
    const head = container.ownerDocument.head;
    for (const sheet of pageStylesheets(page)) {
      const present = [...head.querySelectorAll('link[data-component-css][data-code-release]')].some((l) => (l as HTMLLinkElement).dataset.codeRelease === sheet.codeRelease && (l as HTMLLinkElement).dataset.componentCss === sheet.name);
      if (present) continue;
      const link = container.ownerDocument.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      link.dataset.componentCss = sheet.name;
      link.dataset.codeRelease = sheet.codeRelease;
      head.append(link);
    }
    holdCss();
  }

  const custom = latest().blocks;
  const load = custom ?? (page.blocksUrl ? () => importBlocksModule(page.blocksUrl!) : null);
  if (!load) {
    if (page.codeRelease === null) fail('NO_CODE_RELEASE', 'The origin named no code release for this body (plain/1); it is shown without blocks.');
    else fail('NO_BLOCKS_ENTRY', 'No blocks module is configured (app.blocks.entry); the body is shown without blocks.');
    return session;
  }
  status('mounting');
  if (signal.aborted) return session; // disposed from onStatus
  load().then(
    async (mod) => {
      if (signal.aborted) return;
      const declared = mod?.BLOCKS_CONTRACT;
      if (typeof mod?.mountBlocks !== 'function' || !declared || declared.major !== page.contract.major) {
        fail('BLOCKS_CONTRACT_UNSUPPORTED', `The blocks module speaks foliwake-blocks/${declared?.major ?? '?'}; this app expects foliwake-blocks/${page.contract.major}.`);
        return;
      }
      const prefix = declared.eventPrefix ?? page.contract.eventPrefix;
      if (prefix !== page.contract.eventPrefix) {
        if (isDevelopment()) console.warn(`[foliwake] the blocks emit "${prefix}:" events; the config expects "${page.contract.eventPrefix}:".`);
        latest().onError?.({ code: 'EVENT_PREFIX_MISMATCH', message: `Blocks emit "${prefix}:" events, the config says "${page.contract.eventPrefix}".` });
      }
      await runHooks('beforeBlocks');
      if (signal.aborted) return;
      stopEvents = listenBlockEvents(container, prefix, (event) => {
        if (!signal.aborted) latest().onEvent?.(event);
      });
      holdCss();
      const host = createHost(
        () => {
          const init = latest().host;
          return (typeof init === 'function' ? init() : init) ?? {};
        },
        { signal, page, shell: latest().shell },
      );
      let returned: MountHandle;
      try {
        returned = mod.mountBlocks(container, host);
      } catch (error) {
        fail('BLOCKS_MOUNT_FAILED', error instanceof Error ? error.message : String(error));
        return;
      }
      if (signal.aborted) {
        // Disposed during mountBlocks (e.g. from onEvent on a synchronous block event): the session's dispose
        // ran before the handle existed, so the returned handle is disposed here and onMount never runs.
        try {
          returned?.dispose();
        } catch (error) {
          console.error('[foliwake] dispose failed', error);
        }
        return;
      }
      handle = returned;
      latest().onMount?.(container, handle);
      if (signal.aborted) return;
      const ready = handle.ready.then(
        (reports) => {
          if (signal.aborted) return;
          const failed = reports.filter((r) => r.status === 'error').length;
          status(failed === 0 ? 'ready' : failed === reports.length && reports.length > 0 && latest().requireBlocks ? 'error' : 'partial', reports);
        },
        (error) => fail('BLOCKS_READY_FAILED', error instanceof Error ? error.message : String(error)),
      );
      await runHooks('afterFirstSection');
      await ready;
      await runHooks('lazy');
      if (signal.aborted) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      await runHooks('delayed');
    },
    (error) => fail('BLOCKS_MODULE_FAILED', `The blocks module could not be loaded: ${error instanceof Error ? error.message : String(error)}`),
  ).catch((error) => fail('BLOCKS_MOUNT_FAILED', error instanceof Error ? error.message : String(error))); // onMount threw
  return session;
}
