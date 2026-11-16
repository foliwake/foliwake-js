// The block ↔ app contract `foliwake-blocks/2`: the project-agnostic core.
// Types only: a code release implements `BlocksModule` and its blocks `BlockInit`; an app builds a `BlockHost`
// (or lets @foliwake/client build it). Vocabulary of a kind of site (answers and verdicts of exercises) lives in
// subpaths such as `@foliwake/blocks-contract/assessment`, which extend the core through `BlockHost<Ext>` and
// `BlockEvents<Ext>`. Minor versions only add; a major version changes anything else.

import type { KnownShell } from './reserved.js';

export type { KnownShell };

/** The site channel a page comes from. */
export type ChannelName = 'live' | 'preview';

/** The version a code release or a host speaks. */
export interface ContractVersion {
  major: 2;
  minor: number;
}

/** What `<code release>/<blocks.entry>` exports. */
export interface BlocksModule {
  /** `eventPrefix`: the prefix its blocks emit events with; absent → the app's configured one. */
  BLOCKS_CONTRACT: ContractVersion & { eventPrefix?: string };
  /** Mounts every `[data-component]` root inside `container`; `host` optional (the module's browser host then). */
  mountBlocks(container: Element, host?: BlockHost): MountHandle;
}

/** What `mountBlocks` returns. */
export interface MountHandle {
  /** One report per root once every root settled. */
  ready: Promise<MountReport[]>;
  /** Idempotent. Leaves the DOM as it is (the app restores the body before a second mount). */
  dispose(): void;
}

/** The `data-component-status` of a block root while and after it mounts, plus `disposed` in a report. */
export type MountStatus = 'loading' | 'ready' | 'error' | 'disposed';

/** The outcome of one block root. */
export interface MountReport {
  root?: Element;
  /** The `data-component` name. */
  name: string;
  key: string | null;
  status: Exclude<MountStatus, 'loading'>;
  /** A failure code (`LOADER_JS_FAILED`, …) when status is 'error'. */
  code?: string;
}

/** Translated block chrome by UI language, then by key (`{ en: { more: 'More' } }`): a block's `ui`. */
export type BlockLabels = Record<string, Record<string, string>>;

/** What a loader knows about a block from the code release's `components/components.json`. */
export interface BlockMeta {
  /** The block's name (its folder, `data-component`). */
  name: string;
  /** The block's own labels by UI language (its JSON `ui`), the fallback after `host.labels`. */
  ui?: BlockLabels;
}

/** What a block's `init` returns. */
export interface BlockHandle {
  /** Idempotent. Ends the block's listeners, timers and islands; leaves its authored HTML. */
  dispose(): void;
}

/**
 * A block module's default export: initialises one root. Called once per root by the loader; a second call on the
 * same root returns the first result. Async setup returns a promise of the handle.
 *
 * The loader always passes `host`: it is required here. A block may also accept being called without one (an
 * editor, a test) and fall back to what the browser gives; the block kit's `defineBlock` does (its init takes
 * `host?`).
 *
 * `contract`, optional: the major version of this contract the block was written for (the kit sets it). A loader
 * refuses a block that declares another major (`LOADER_BLOCK_CONTRACT`); a block that declares none is accepted.
 */
export type BlockInit<Host extends BlockHost = BlockHost> = ((
  root: Element,
  host: Host,
  meta?: BlockMeta,
) => BlockHandle | Promise<BlockHandle>) & { readonly contract?: number };

/**
 * React for blocks that render with it: the app's own `createElement` (from `react`) and `createRoot` (from
 * `react-dom/client`), so an embedded page uses the app's React instead of loading its own. Announced by
 * `has('react')`; blocks fall back to their own React without it.
 */
export interface HostReact {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
  createRoot(
    container: Element,
    options?: Record<string, unknown>,
  ): { render(children: unknown): void; unmount(): void };
}

/** The members every host has (the core of `BlockHost`). Optional members are announced by `has(name)`. */
export interface HostCore {
  contract: ContractVersion;
  /** Which app mounts: one of KnownShell, or another app's own name. */
  shell: KnownShell | (string & {});
  /** HTML contract of the body being mounted (`X-Html-Contract`). */
  htmlContract: string;
  channel: ChannelName;
  /** 'local' | 'preview' show loader notices before failed roots; anything else: console only. */
  env?: string;
  /** The site's own mode of the page (a token such as `print`); its values belong to the site or a subpath. */
  mode?: string;
  /** Content language (BCP 47). */
  lang: string;
  /** The app's UI language for block chrome. */
  uiLang: string;
  /** Translated block chrome ('more' → 'Ещё'), from the app's i18n; wins over the block's own `ui`. */
  labels?: Record<string, string>;
  theme: 'light' | 'dark';
  reducedMotion: boolean;
  /** Aborted on dispose; a block treats it as dispose. */
  signal: AbortSignal;
  keyOf(root: Element): string;
  media?(url: string, hint?: { width?: number }): string;
  track?(name: string, data: Record<string, unknown>): void;
  /** The app's React (`has('react')`). */
  react?: HostReact;
  has(feature: string): boolean;
}

/**
 * The object an app gives every block: the core members and the members of an extension (`Ext`), for example
 * `BlockHost<AssessmentHostMembers>` from `@foliwake/blocks-contract/assessment`. An extension's members are
 * optional and announced by `has(name)` like the core's.
 */
export type BlockHost<Ext extends object = Record<never, never>> = HostCore & Ext;

/** The `detail` of the core event types (besides `key` and `block`). */
export interface CoreEventDetails {
  /**
   * The block finished its setup: the block sends it, or the block-kit after setup when it did not (block-kit 1
   * does not).
   */
  ready: { contract: number };
  error: { code: string; message: string; recoverable: boolean };
}

/**
 * Event details by type: the core's and an extension's (`Ext`). A type both name gets both details
 * (`ready` of the assessment extension adds `required` and `restored`).
 */
export type BlockEvents<Ext extends object = Record<never, never>> = CoreEventDetails & Ext;

/** The event types of an event map (`<prefix>:<type>`); the core's by default. */
export type BlockEventType<Events extends object = BlockEvents> = keyof Events & string;

/** Every event carries the block's key and name besides its own fields. */
export type BlockEventDetail<Events extends object, T extends BlockEventType<Events>> = Events[T] & {
  key: string;
  block: string;
};

/** A block event as an app receives it (`<prefix>:<type>` CustomEvent, bubbling from its root); a union by type. */
export type FoliwakeEvent<
  Events extends object = BlockEvents,
  T extends BlockEventType<Events> = BlockEventType<Events>,
> = {
  [K in T]: { type: K; detail: BlockEventDetail<Events, K>; target: Element; native: CustomEvent };
}[T];

/** The contract name an app config names (`app.blocks.contract`). */
export type BlocksContractName = `foliwake-blocks/${number}`;
