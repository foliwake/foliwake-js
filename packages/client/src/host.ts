// createHost: the BlockHost a page's blocks receive (foliwake-blocks/1). Every app-provided member is read
// through `init()` at call time, so newer saved answers, labels or callbacks take effect without a remount
// and a stale closure is never called (design §6.2 invariant 2).
import type { BlockHost, ContractVersion } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';

/** The app's part of the host; mountFoliwakePage fills contract, signal, htmlContract, channel and has. */
export type HostInit = Partial<Omit<BlockHost, 'signal' | 'contract' | 'htmlContract' | 'channel' | 'has'>>;

/** The contract minor this package speaks (foliwake-blocks/1.1: `BLOCKS_CONTRACT.eventPrefix`). */
export const HOST_CONTRACT_MINOR = 1;
const OPTIONAL = ['saved', 'check', 'media', 'track', 'labels', 'react'] as const;

function prefers(query: string): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(query).matches;
  } catch {
    return false;
  }
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
 * @returns A `BlockHost` for `mountBlocks`: contract, signal, HTML contract and channel come from the page;
 *   `has(name)` is true for the optional members the app gave.
 */
export function createHost(init: HostInit | (() => HostInit), base: { signal: AbortSignal; page: FoliwakePageData; shell?: string }): BlockHost {
  const get: () => HostInit = typeof init === 'function' ? init : () => init;
  const { page, signal } = base;
  const shell = base.shell ?? 'web';
  const contract: ContractVersion = Object.freeze({ major: page.contract.major as 1, minor: HOST_CONTRACT_MINOR });
  const docLang = () => (typeof document !== 'undefined' ? document.documentElement.lang : '') || 'en';
  const host: BlockHost = {
    contract,
    get shell() { return get().shell ?? shell; },
    htmlContract: page.htmlContract,
    channel: page.channel,
    get env() { return get().env ?? (page.channel === 'preview' ? 'preview' : 'live'); },
    get mode() { return get().mode ?? page.mode; },
    get lang() { return get().lang ?? page.lang ?? docLang(); },
    get uiLang() { return get().uiLang ?? docLang(); },
    get labels() { return get().labels; },
    // The app's React for blocks that render with it (block-kit mountReact); undefined: they use their own.
    get react() { return get().react; },
    get theme() { return get().theme ?? documentTheme(); },
    get reducedMotion() { return get().reducedMotion ?? prefers('(prefers-reduced-motion: reduce)'); },
    signal,
    get policy() { return get().policy ?? {}; },
    keyOf: (root) => get().keyOf?.(root) ?? root.getAttribute('data-block-key') ?? '',
    saved: (key) => (signal.aborted ? null : get().saved?.(key) ?? null),
    check: (key, answer, opts) => {
      const check = get().check;
      if (!check) return Promise.reject(new Error('This host does not grade answers (host.has("check") is false).'));
      return check(key, answer, opts);
    },
    media: (url, hint) => get().media?.(url, hint) ?? url,
    track: (name, data) => {
      if (!signal.aborted) get().track?.(name, data);
    },
    has: (feature) => {
      if ((OPTIONAL as readonly string[]).includes(feature)) return get()[feature as (typeof OPTIONAL)[number]] !== undefined;
      return feature === 'signal' || feature === 'channel';
    },
  };
  return host;
}
