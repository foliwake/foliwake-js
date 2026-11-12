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
import type { BlockEvents, BlockEventType, CoreEventDetails, BlocksModule, FoliwakeEvent, MountHandle, MountReport } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';
import { acquireCss } from './css-registry.js';
import { isDevelopment } from './dev.js';
import { listenBlockEvents } from './events.js';
import { createHost, type HostInit } from './host.js';
import { ensureImportMap } from './import-map.js';
import { importBlocksModule } from './load.js';

/**
 * Where a mount is: `mounting` (module loading), `ready` (every block mounted), `partial` (some blocks failed),
 * `static` (the body is shown without blocks; `onError` says why), `error` (only with `requireBlocks`: no blocks,
 * or every block failed).
 */
export type FoliwakePageStatus = 'mounting' | 'ready' | 'partial' | 'static' | 'error';
/**
 * What `onError` receives. Codes: `NO_CODE_RELEASE`, `NO_BLOCKS_ENTRY`, `BLOCKS_CONTRACT_UNSUPPORTED`,
 * `BLOCKS_MODULE_FAILED`, `BLOCKS_MOUNT_FAILED`, `BLOCKS_READY_FAILED`, `EVENT_PREFIX_MISMATCH`, `HOOK_FAILED`.
 */
export interface FoliwakePageError {
  code: string;
  message: string;
}

/** The lifecycle phases a hook can run in, in phase order. */
export const HOOK_PHASES = Object.freeze(['beforeBlocks', 'afterFirstSection', 'lazy', 'delayed'] as const);
/** One of `HOOK_PHASES`. */
export type FoliwakeHookPhase = (typeof HOOK_PHASES)[number];
/** What a lifecycle hook receives. */
export interface FoliwakeHookContext {
  phase: FoliwakeHookPhase;
  container: HTMLElement;
  page: FoliwakePageData;
  /** Aborted on dispose: a hook stops its work. */
  signal: AbortSignal;
}
/** A lifecycle hook; a returned promise is awaited (raced against `signal`). */
export type FoliwakeHook = (context: FoliwakeHookContext) => void | Promise<void>;
/** Hooks of one level (site or template), by phase. */
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
export interface FoliwakeMountCallbacks<Ext extends object = Record<never, never>, Events extends CoreEventDetails = BlockEvents> {
  /** The app's part of the block host (core members and its extension's); a function is called at every member read. */
  host?: HostInit<Ext> | (() => HostInit<Ext>);
  /** Every block event under the element (`<prefix>:<type>`) of the core types and `events`, as a typed `FoliwakeEvent`. */
  onEvent?: (event: FoliwakeEvent<Events>) => void;
  /**
   * Event types of `Events` delivered to `onEvent` besides the core `ready` and `error` (an extension's, the site's
   * own). A change through `update()` (or a React prop) changes the subscription.
   */
  events?: readonly BlockEventType<Events>[];
  /** Without blocks the page is `error` instead of `static`. */
  requireBlocks?: boolean;
  /** Each status change; `reports` (one per block root) once the blocks settled. */
  onStatus?: (status: FoliwakePageStatus, reports?: MountReport[]) => void;
  /** Why blocks are missing or failed (the page still shows its body). */
  onError?: (error: FoliwakePageError) => void;
  /** Imperative app logic on the mounted container (slides, focus). */
  onMount?: (container: HTMLElement, handle: MountHandle) => void;
  /** Lifecycle hooks by phase, site-level then template-level (FoliwakeHooks). */
  hooks?: FoliwakeHooks;
}

/** Options of `mountFoliwakePage`: the page, how to treat the element's body, and the callbacks. */
export interface FoliwakeMountOptions<Ext extends object = Record<never, never>, Events extends CoreEventDetails = BlockEvents> extends FoliwakeMountCallbacks<Ext, Events> {
  /** The prepared page (from `preparePage` / `readPage` on the server). */
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
  /** The document's CSP nonce (CSP strategy `nonce`): set on the import map this mount adds (ensureImportMap). */
  nonce?: string;
}

/** A running mount, returned by `mountFoliwakePage`. */
export interface FoliwakeMount<Ext extends object = Record<never, never>, Events extends CoreEventDetails = BlockEvents> {
  /** The element the page is mounted in. */
  readonly element: HTMLElement;
  /** The current page (the latest one passed to `update`). */
  readonly page: FoliwakePageData;
  /** The last status reported; 'disposed' after dispose. */
  readonly status: FoliwakePageStatus | 'idle' | 'disposed';
  /** New callbacks or host (latest wins, no remount); a `page` with another identity remounts. */
  update(next: FoliwakeMountCallbacks<Ext, Events> & { page?: FoliwakePageData }): void;
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
  /** The latest options may name other event types: follow them (no-op before the blocks listen, or when equal). */
  eventsChanged(): void;
  dispose(): void;
}

/**
 * Shows `options.page` in `element` and mounts its blocks from the page's own code release. Problems of the
 * blocks (no code release, another contract, a failing module) go to `onError` / `onStatus`; the body stays.
 *
 * @param element - The element that holds (or will hold) the page body, already in the document.
 * @returns The mount: `update()` for new callbacks or another page, `dispose()` on unmount.
 */
export function mountFoliwakePage<Ext extends object = Record<never, never>, Events extends CoreEventDetails = BlockEvents>(
  element: HTMLElement,
  options: FoliwakeMountOptions<Ext, Events>,
): FoliwakeMount<Ext, Events> {
  let opts: FoliwakeMountOptions<Ext, Events> = { ...options };
  const external = options.signal;
  // An already aborted signal: nothing starts (no body change, no import, no callback).
  let disposed = external?.aborted === true;
  let session: Session = { status: 'idle', eventsChanged() {}, dispose() {} };
  // start() registers its session before it calls any app callback, so a dispose(), an external abort or an
  // update() from inside a callback always reaches the session that is running (never a stale one).
  const begin = () => start(element, () => opts, opts.page, (created) => (session = created));
  // Bumped by every remounting update(). Disposing a session runs foreign code (the blocks' dispose, abort
  // listeners of hooks) that may re-enter dispose() or update(); the outer update starts its session only when
  // the mount is still live and no newer update superseded it, so nothing starts on a disposed mount and no
  // session is started twice or orphaned.
  let generation = 0;

  const mount: FoliwakeMount<Ext, Events> = {
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
        const mine = ++generation;
        session.dispose();
        if (!disposed && mine === generation) begin();
      } else if ('events' in next) {
        session.eventsChanged();
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

// App or page code can run synchronously inside start(), and any of it may dispose the mount, abort its external
// signal or call update(). The known points (not a proof that there are no others):
//  - setting the body's innerHTML: custom elements' constructors, connectedCallback of the new children and
//    disconnectedCallback of the replaced ones; the container's attributes (attributeChangedCallback when the
//    container is a custom element);
//  - every app callback (onStatus, onError, onEvent, onMount), the host function and getters on objects the
//    caller supplied (options, host, page);
//  - a custom `blocks()` loader (called synchronously), module evaluation (inside the import, async);
//  - mountBlocks() (block constructors, synchronous block events → onEvent), hooks, handle.ready continuations;
//  - handle.dispose() and abort listeners while a session is disposed (re-entrancy; see `generation`).
// Resources are taken through own(): it acquires only while the session is live and registers the release with
// the session; when the session was disposed during the acquisition, the release runs at once. After each of
// the points above the code checks `live()` before going on. This is cooperative, best-effort hygiene against
// app and page code that re-enters the mount; it is not a sandbox against hostile synchronous page code (which
// runs with the page's full authority anyway).
function start<Ext extends object, Events extends CoreEventDetails>(container: HTMLElement, latest: () => FoliwakeMountOptions<Ext, Events>, page: FoliwakePageData, register: (session: Session) => void): Session {
  const controller = new AbortController();
  const { signal } = controller;
  const live = () => !signal.aborted;
  const releases: (() => void)[] = [];
  const safely = (release: () => void) => {
    try {
      release();
    } catch (error) {
      console.error('[foliwake] dispose failed', error);
    }
  };
  // The event listeners of the blocks: started once the module passed its checks, replaced when the latest
  // options name other types (follow() is set then).
  let follow: (() => void) | null = null;
  const session: Session = {
    status: 'idle',
    eventsChanged() {
      if (live()) follow?.();
    },
    dispose() {
      if (signal.aborted) return;
      controller.abort();
      // Last acquired, first released: the blocks' handle before the event listener and the CSS count.
      while (releases.length > 0) safely(releases.pop()!);
    },
  };
  /** Takes a resource only while live; its release runs on dispose, or at once if dispose came meanwhile. */
  const own = (acquire: () => (() => void) | null | undefined): boolean => {
    if (!live()) return false;
    const release = acquire();
    if (release) {
      if (live()) releases.push(release);
      else safely(release);
    }
    return live();
  };
  register(session);
  const aborted = new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));

  const status = (s: FoliwakePageStatus, reports?: MountReport[]) => {
    if (!live()) return;
    session.status = s;
    latest().onStatus?.(s, reports);
  };
  const fail = (code: string, message: string) => {
    if (!live()) return;
    latest().onError?.({ code, message });
    status(latest().requireBlocks ? 'error' : 'static');
  };
  // The phase's hooks, site then template, each awaited; read from the latest options at call time.
  const runHooks = async (phase: FoliwakeHookPhase) => {
    for (const level of ['site', 'template'] as const) {
      if (!live()) return;
      const hook = latest().hooks?.[level]?.[phase];
      if (!hook) continue;
      try {
        // Raced against the mount's signal: a slow hook never holds up dispose or the next mount. The hook
        // itself is cooperative: it gets the signal and must check it after each await (README, "hooks").
        await Promise.race([hook({ phase, container, page, signal }), aborted]);
      } catch (error) {
        if (live()) latest().onError?.({ code: 'HOOK_FAILED', message: `${level} ${phase} hook: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
  };
  let cssHeld = false;
  // The CSS count of the page's code release, once per session; with `stylesheets`, also its links (removed by
  // the count's release when the last mount of the release goes).
  const holdCss = (addLinks: boolean) =>
    own(() => {
      if (cssHeld || !page.codeRelease) return null;
      cssHeld = true;
      const release = acquireCss(container.ownerDocument, page.codeRelease);
      if (addLinks) appendStylesheets(container.ownerDocument, page);
      return release;
    });

  const { body = 'auto', stylesheets = false } = latest();
  if (body === 'insert' || (body === 'auto' && (mountedOnce.has(container) || !container.hasChildNodes()))) container.innerHTML = page.html;
  mountedOnce.add(container);
  if (!live()) return session;
  // One attribute at a time, each only while live: attributeChangedCallback of a custom-element container may
  // dispose the mount between two writes.
  for (const [name, value] of [['data-foliwake-body', ''], ['data-html-contract', page.htmlContract]] as const) {
    if (!live()) return session;
    if (!container.hasAttribute(name)) container.setAttribute(name, value);
  }
  if (!live()) return session;
  if (stylesheets && !holdCss(true)) return session;

  const custom = latest().blocks;
  const load = custom ?? (page.blocksUrl ? () => importBlocksModule(page.blocksUrl!) : null);
  // Blocks import the block-kit as `foliwake`: the page's import map (rendered by the server, else added here).
  if (load && !custom) ensureImportMap(container.ownerDocument, page, latest().nonce);
  if (!load) {
    if (page.codeRelease === null) fail('NO_CODE_RELEASE', 'The origin named no code release for this body (plain/1); it is shown without blocks.');
    else fail('NO_BLOCKS_ENTRY', 'No blocks module is configured (app.blocks.entry); the body is shown without blocks.');
    return session;
  }
  status('mounting');
  if (!live()) return session; // disposed from onStatus
  let loading: Promise<BlocksModule>;
  try {
    loading = Promise.resolve(load());
  } catch (error) {
    loading = Promise.reject(error);
  }
  // Settled in every case: a loader that disposed the mount and then threw or returned a rejected promise must
  // not leave an unhandled rejection (its failure is not reported after the dispose).
  loading.catch(() => undefined);
  if (!live()) return session; // disposed from a custom loader
  loading.then(
    async (mod) => {
      if (!live()) return;
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
      if (!holdCss(false)) return;
      let types = '';
      let stop: (() => void) | null = null;
      const subscribe = () => {
        const wanted = latest().events ?? [];
        const key = [...new Set(wanted)].sort().join(' ');
        if (stop && key === types) return;
        stop?.();
        types = key;
        stop = listenBlockEvents<Events, BlockEventType<Events>>(
          container,
          prefix,
          (event) => {
            if (live()) latest().onEvent?.(event);
          },
          wanted,
        );
      };
      const listening = own(() => {
        subscribe();
        follow = subscribe;
        return () => {
          follow = null;
          stop?.();
        };
      });
      if (!listening) return;
      const host = createHost<Ext>(
        () => {
          const init = latest().host;
          return (typeof init === 'function' ? init() : init) ?? {};
        },
        { signal, page, shell: latest().shell },
      );
      let handle: MountHandle | null = null;
      let failure: unknown = null;
      // mountBlocks runs block code (which may emit events → onEvent → dispose); through own(), a handle
      // returned after a dispose is disposed at once and nothing below runs.
      const mounted = own(() => {
        try {
          handle = mod.mountBlocks(container, host);
        } catch (error) {
          failure = error;
          return null;
        }
        const h = handle;
        return h ? () => h.dispose() : null;
      });
      if (failure !== null) {
        fail('BLOCKS_MOUNT_FAILED', failure instanceof Error ? failure.message : String(failure));
        return;
      }
      if (!mounted || !handle) return;
      const current: MountHandle = handle;
      latest().onMount?.(container, current);
      if (!live()) return;
      const ready = current.ready.then(
        (reports) => {
          if (!live()) return;
          const failed = reports.filter((r) => r.status === 'error').length;
          status(failed === 0 ? 'ready' : failed === reports.length && reports.length > 0 && latest().requireBlocks ? 'error' : 'partial', reports);
        },
        (error) => fail('BLOCKS_READY_FAILED', error instanceof Error ? error.message : String(error)),
      );
      await runHooks('afterFirstSection');
      await ready;
      await runHooks('lazy');
      if (!live()) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
      await runHooks('delayed');
    },
    (error) => fail('BLOCKS_MODULE_FAILED', `The blocks module could not be loaded: ${error instanceof Error ? error.message : String(error)}`),
  ).catch((error) => fail('BLOCKS_MOUNT_FAILED', error instanceof Error ? error.message : String(error))); // onMount threw
  return session;
}

/** Adds the links of the body's block stylesheets to <head> unless a link for that block and release is there. */
function appendStylesheets(doc: Document, page: FoliwakePageData): void {
  const head = doc.head;
  for (const sheet of pageStylesheets(page)) {
    const present = [...head.querySelectorAll('link[data-component-css][data-code-release]')].some((l) => (l as HTMLLinkElement).dataset.codeRelease === sheet.codeRelease && (l as HTMLLinkElement).dataset.componentCss === sheet.name);
    if (present) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = sheet.href;
    link.dataset.componentCss = sheet.name;
    link.dataset.codeRelease = sheet.codeRelease;
    head.append(link);
  }
}
