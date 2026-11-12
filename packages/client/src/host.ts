// createHost: the BlockHost a page's blocks receive (foliwake-blocks/2). Every app-provided member is read
// through `init()` at call time, so newer data, labels or callbacks take effect without a remount and a stale
// closure is never called (design §6.2 invariant 2). Members of an extension (`BlockHost<Ext>`, for example the
// assessment's `saved` and `check`) are not known here: they are read through from the app's part as given,
// and its functions are not called after dispose.
import type { BlockHost, ContractVersion, HostCore } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';

/** The app's part of the host: the core members it may set, and the members of its extension (`Ext`). */
export type HostInit<Ext extends object = Record<never, never>> = Partial<Omit<HostCore, 'signal' | 'contract' | 'htmlContract' | 'channel' | 'has'>> & Partial<Ext>;

/**
 * The host `createHost` returns: the core, and the extension's members as optional ones (the app may give any of
 * them or none, and may stop giving one; a block checks `has(name)` first).
 */
export type CreatedHost<Ext extends object = Record<never, never>> = BlockHost<Partial<Ext>>;

/** The contract minor this package speaks. */
export const HOST_CONTRACT_MINOR = 0;
/** Optional core members; `has(name)` is true when the app gave one. */
const OPTIONAL = ['media', 'track', 'labels', 'react'] as const;

function prefers(query: string): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia(query).matches;
}

function documentTheme(): 'light' | 'dark' {
  const chosen = typeof document !== 'undefined' ? document.documentElement.dataset.theme : undefined;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return prefers('(prefers-color-scheme: dark)') ? 'dark' : 'light';
}

/**
 * The host a page's blocks receive. `init` (or what it returns) is read at every call. `base.shell` is the
 * shell named when the app names none (default `'web'`; the React package passes `'react'`).
 *
 * @param init - The app's part of the host, or a function returning it (called at every member read).
 * @param base - The mount's signal, the page and the default shell.
 * @returns A host for `mountBlocks` (extension members optional, `CreatedHost<Ext>`): contract, signal, HTML contract and channel come from the page;
 *   `has(name)` is true for the optional members the app gave (core and extension alike).
 */
export function createHost<Ext extends object = Record<never, never>>(
  init: HostInit<Ext> | (() => HostInit<Ext>),
  base: { signal: AbortSignal; page: FoliwakePageData; shell?: string },
): CreatedHost<Ext> {
  const get: () => HostInit<Ext> = typeof init === 'function' ? init : () => init;
  const { page, signal } = base;
  const shell = base.shell ?? 'web';
  const contract: ContractVersion = Object.freeze({ major: page.contract.major as 2, minor: HOST_CONTRACT_MINOR });
  const docLang = () => (typeof document !== 'undefined' ? document.documentElement.lang : '') || 'en';
  const core: HostCore = {
    contract,
    get shell() { return get().shell ?? shell; },
    htmlContract: page.htmlContract,
    channel: page.channel,
    get env() { return get().env ?? (page.channel === 'preview' ? 'preview' : 'live'); },
    get mode() { return get().mode ?? page.mode ?? undefined; },
    get lang() { return get().lang ?? page.lang ?? docLang(); },
    get uiLang() { return get().uiLang ?? docLang(); },
    get labels() { return get().labels; },
    // The app's React for blocks that render with it; undefined: they use their own.
    get react() { return get().react; },
    get theme() { return get().theme ?? documentTheme(); },
    get reducedMotion() { return get().reducedMotion ?? prefers('(prefers-reduced-motion: reduce)'); },
    signal,
    keyOf: (root) => get().keyOf?.(root) ?? root.getAttribute('data-block-key') ?? '',
    media: (url, hint) => get().media?.(url, hint) ?? url,
    track: (name, data) => {
      if (!signal.aborted) get().track?.(name, data);
    },
    has: (feature) => {
      if ((OPTIONAL as readonly string[]).includes(feature)) return get()[feature as (typeof OPTIONAL)[number]] !== undefined;
      if (feature === 'signal' || feature === 'channel') return true;
      if (feature === 'mode') return core.mode !== undefined;
      return !(feature in core) && extension(feature) !== undefined;
    },
  };
  // An extension member as the app gives it now. A function is a wrapper that looks the member up again at
  // every call, after the abort check: a block that kept `host.saved` calls the app's latest one, and no app
  // callback runs once the mount is gone (it returns undefined then, or when the app no longer gives it).
  const member = (name: string): unknown => (get() as Record<string, unknown>)[name];
  const extension = (name: string): unknown => {
    if (typeof member(name) !== 'function') return member(name);
    return (...args: unknown[]) => {
      if (signal.aborted) return undefined;
      const source = get() as Record<string, unknown>;
      const current = source[name];
      return typeof current === 'function' ? (current as (...a: unknown[]) => unknown).apply(source, args) : undefined;
    };
  };
  return new Proxy(core, {
    get(target, name, receiver) {
      if (typeof name !== 'string' || name in target) return Reflect.get(target, name, receiver);
      return extension(name);
    },
    has(target, name) {
      return name in target || (typeof name === 'string' && extension(name) !== undefined);
    },
  }) as CreatedHost<Ext>;
}
