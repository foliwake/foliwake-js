// Types of the module `@foliwake/block-kit` (block-kit.js; `foliwake` is its previous specifier), self-contained
// for editors of a site folder without node_modules: create-foliwake and the Foliwake CLI write this file as
// `.foliwake/types/foliwake.d.ts` (jsconfig `paths` maps both specifiers there), and
// `.foliwake/types/blocks/<name>.d.ts`, generated from each block's JSON, adds the block to `FoliwakeBlocks`.
// The package's own entry (index.d.ts) re-exports these and the blocks contract's types.

/** What `html` returns (lit-html's template result). */
export interface TemplateResult {
  readonly strings: TemplateStringsArray;
  readonly values: readonly unknown[];
}
/** lit-html's `html` tag: a template rendered by `ctx.render`, without eval. */
export declare function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult;
/** Renders nothing (lit-html's `nothing`). */
export declare const nothing: unique symbol;

export declare const version: string;
/** The block's fields by name, read from the engine's HTML (what `defineBlock` gives `setup`). */
export declare function readFields(root: Element): Record<string, unknown>;
export declare const CONTRACT: 2;

/** What a block's JSON says, by block name; `.foliwake/types/blocks/<name>.d.ts` adds each block. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FoliwakeBlocks {}

/** One block's entry in `FoliwakeBlocks`. */
export interface BlockTypes {
  fields: Record<string, unknown>;
  events: Record<string, Record<string, unknown>>;
  ui: string;
}

type Of<Name extends string> = Name extends keyof FoliwakeBlocks ? FoliwakeBlocks[Name] : BlockTypes;
type Fields<Name extends string> = Of<Name> extends { fields: infer F } ? F : Record<string, unknown>;
type Events<Name extends string> = Of<Name> extends { events: infer E } ? E : Record<string, Record<string, unknown>>;
type Labels<Name extends string> = Of<Name> extends { ui: infer U extends string } ? U : string;
type ItemOf<T> = T extends ReadonlyArray<infer U> ? U : unknown;

/** A view: what `html` returns, or `nothing`. */
export type View = TemplateResult | typeof nothing | string | number | null | undefined;

/** A React root (`createRoot`). */
export interface ReactRoot {
  render(children: unknown): void;
  unmount(): void;
}

/** The app's React for blocks that render with it (`has('react')`). */
export interface HostReact {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
  createRoot(container: Element, options?: Record<string, unknown>): ReactRoot;
}

/** The members of the page's host the kit reads: the core of the blocks contract (`HostCore`). */
export interface HostMembers {
  contract: { major: number; minor: number };
  shell: string;
  htmlContract: string;
  channel: 'live' | 'preview';
  env?: string;
  mode?: string;
  lang: string;
  uiLang: string;
  labels?: Record<string, string>;
  theme: 'light' | 'dark';
  reducedMotion: boolean;
  signal: AbortSignal;
  keyOf(root: Element): string;
  /** The app's React (`has('react')`). */
  react?: HostReact;
  has(feature: string): boolean;
}

/** The page's host as a block reads it: the core, and the members of extensions by name (`has(name)`). */
export interface Host extends HostMembers {
  [member: string]: unknown;
}

/** What the loader knows about the block (`components/components.json`). */
export interface BlockMeta {
  name: string;
  ui?: Record<string, Record<string, string>>;
}

/** A framework view for `ctx.mount`: the site's adapter of React, Preact, Vue, … */
export interface ViewAdapter<Props> {
  render(element: HTMLElement, props: Props, controls: { fail(error: unknown): void }): void | Promise<void>;
  unmount(element: HTMLElement): void;
}

export interface ViewHandle<Props> {
  element: HTMLElement;
  update(props: Props): void;
  dispose(): void;
  fail(error: unknown): void;
}

export interface ViewOptions<Props> {
  /** Hide the authored children while the view shows (they come back on failure and dispose). */
  replace?: boolean;
  /** A field name or an element of the block to mount in (default: the root, after its children). */
  into?: string | Element;
  onReady?(handle: ViewHandle<Props>): void;
  onError?(error: unknown): void;
}

/** A value that re-renders the block's views when it is replaced (batched per microtask). */
export interface State<T> {
  value: T;
}

/** What `ctx.list` calls for each item of a list or choices field. */
type ListItem<Field> = (item: HTMLElement, value: ItemOf<NonNullable<Field>>, index: number) => View | void;

/** What a block's setup may return: nothing, a cleanup, a handle, or a promise of one of them. */
type SetupResult = void | (() => void) | { dispose(): void };

export interface BlockContext<Name extends string> {
  root: HTMLElement;
  host: Host;
  /** The block's key (`host.keyOf(root)`). */
  key: string;
  /** Aborted when the block is disposed. */
  signal: AbortSignal;
  fields: Fields<Name>;
  field(name: keyof Fields<Name> & string): HTMLElement | null;
  /** A unique id of this block instance, for `id`/`for`/`aria-*` (`suffix` tells several apart). */
  id(suffix?: string): string;
  /** Sets attributes of a server node: true → "" ("true" for aria-*), false/null/undefined → removed. */
  attrs<E extends Element>(el: E, values: Record<string, string | number | boolean | null | undefined>): E;
  /** A listener on the root (or `target`) that ends with the block; with a selector, `handler(event, match)`. */
  on(type: string, handler: (event: Event, match: Element) => void): () => void;
  on(type: string, selector: string, handler: (event: Event, match: Element) => void): () => void;
  on(target: EventTarget, type: string, handler: (event: Event, match: Element) => void): () => void;
  on(target: EventTarget, type: string, selector: string, handler: (event: Event, match: Element) => void): () => void;
  /** A bubbling `<prefix>:<type>` event with `{ key, block, ...detail }`; nothing after dispose. */
  emit<T extends keyof Events<Name> & string>(type: T, detail: Events<Name>[T]): boolean;
  emit(type: 'ready', detail?: Record<string, unknown>): boolean;
  emit(type: 'error', detail: { code: string; message: string; recoverable: boolean }): boolean;
  /** A label: `host.labels`, then the block's `ui` (UI language, its base language, English), then the key. */
  t(key: Labels<Name>): string;
  state<T>(initial: T): State<T>;
  /** Runs now and after every state change (for server nodes); may return a cleanup. */
  effect(fn: () => void | (() => void)): void;
  /** Renders `view()` into the root (after its children), a field or an element; returns the update. */
  render(view: () => View, options?: { into?: string | Element }): () => void;
  /** For each item of a list or choices field: `fn(item, value, index)`; a returned view is rendered into the item. */
  list<K extends keyof Fields<Name> & string>(name: K, fn: ListItem<Fields<Name>[K]>): HTMLElement[];
  mount<Props>(adapter: ViewAdapter<Props>, props: Props, options?: ViewOptions<Props>): ViewHandle<Props>;
}

/**
 * The block's `init(root, host, meta)` for the loader: `block` is its name, `contract` the major of the blocks
 * contract it speaks. The loader always passes `host`; `host` is optional here so a block also runs without one
 * (an editor, a test), with the browser's fallbacks: its key from `data-block-key`, its labels from its own `ui`
 * (English first), no signal; `ctx.host` is then undefined.
 */
export interface BlockInit {
  (root: Element, host?: HostMembers, meta?: BlockMeta): { dispose(): void } | Promise<{ dispose(): void }>;
  readonly block: string;
  readonly contract: 2;
}

export declare function defineBlock<Name extends string>(
  name: Name,
  setup: (fields: Fields<Name>, ctx: BlockContext<Name>) => SetupResult | Promise<SetupResult>,
  options?: { prefix?: string },
): BlockInit;
