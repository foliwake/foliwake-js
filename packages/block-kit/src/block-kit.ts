// Foliwake block-kit (https://docs.foliwake.dev/guide/write-a-block): the module site blocks import,
//
//   import { defineBlock, html } from '@foliwake/block-kit';
//
// The engine maps the specifier to `<code release>/_foliwake/block-kit.js` with an import map in every
// page it composes, and adds this file (with the vendored lit-html next to it) to every code release, so a
// release always runs the kit it was prepared and tested with. No build step, no other dependency.
// The file is compiled by tsc from src/block-kit.ts of @foliwake/block-kit (one module, not minified): edit the
// source, not the built file.
//
// `html` is lit-html's (lit-html.js, unchanged from lit-html 3.3.3):
//   Copyright (c) 2017 Google LLC. All rights reserved.
//   Redistribution and use in source and binary forms, with or without modification, are permitted provided
//   that the following conditions are met:
//   1. Redistributions of source code must retain the above copyright notice, this list of conditions and the
//      following disclaimer.
//   2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and
//      the following disclaimer in the documentation and/or other materials provided with the distribution.
//   3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or
//      promote products derived from this software without specific prior written permission.
//   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
//   WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
//   PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY
//   DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
//   PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
//   CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
//   OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
//   SUCH DAMAGE.
import { html, nothing, render as renderTemplate } from './lit-html.js';
import type { TemplateResult } from './lit-html.js';

export { html, nothing };
export type { TemplateResult };

// ---------------------------------------------------------------------------------------------------------------
// Public types. tsc erases them from block-kit.js; they are the package's declarations (block-kit.d.ts, and the
// standalone foliwake.d.ts that create-foliwake and the Foliwake CLI write as `.foliwake/types/foliwake.d.ts` of a
// site folder; `.foliwake/types/blocks/<name>.d.ts`, generated from each block's JSON, adds the block to
// `FoliwakeBlocks`).
// ---------------------------------------------------------------------------------------------------------------

/** What a block's JSON says, by block name; `.foliwake/types/blocks/<name>.d.ts` adds each block. */
export interface FoliwakeBlocks {}

/** One block's entry in `FoliwakeBlocks`. */
export interface BlockTypes {
  fields: Record<string, unknown>;
  events: Record<string, Record<string, unknown>>;
  ui: string;
}

// The helpers below were public through the hand-written declarations of 0.3.0 (a .d.ts exports every top-level
// declaration), so they stay exported.
/** The entry of block `Name` in `FoliwakeBlocks`, or `BlockTypes` for a block it does not know. */
export type Of<Name extends string> = Name extends keyof FoliwakeBlocks ? FoliwakeBlocks[Name] : BlockTypes;
/** The fields of block `Name`. */
export type Fields<Name extends string> = Of<Name> extends { fields: infer F } ? F : Record<string, unknown>;
/** The events of block `Name` by type, with their details. */
export type Events<Name extends string> = Of<Name> extends { events: infer E }
  ? E
  : Record<string, Record<string, unknown>>;
/** The label keys of block `Name` (its `ui`). */
export type Labels<Name extends string> = Of<Name> extends { ui: infer U extends string } ? U : string;
/** The item type of a list. */
export type ItemOf<T> = T extends ReadonlyArray<infer U> ? U : unknown;

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
export type ListItem<Field> = (item: HTMLElement, value: ItemOf<NonNullable<Field>>, index: number) => View | void;

/** What a block's setup may return: nothing, a cleanup, a handle, or a promise of one of them. */
export type SetupResult = void | (() => void) | { dispose(): void };

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
  attrs<E extends Element>(el: E, values: Record<string, AttributeValue>): E;
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

/** An attribute value for `ctx.attrs`. */
type AttributeValue = string | number | boolean | null | undefined;

// ---------------------------------------------------------------------------------------------------------------
// Internal types (erased; not in the declarations).
// ---------------------------------------------------------------------------------------------------------------

/** What `init` returns and keeps per root. */
interface Disposable {
  dispose(): void;
}

/** One block instance: its cleanups, renders, effects and the batched update of its state. */
interface Instance {
  controller: AbortController;
  cleanups: Array<() => void>;
  views: Array<{ update(): void }>;
  effects: Array<{ run(): void }>;
  scheduled: boolean;
  readySent: boolean;
  handle: Disposable | Promise<Disposable> | null;
  /** Set when an async setup rejected: the rejection wins over the dispose it causes. */
  failed?: boolean;
  live(): boolean;
  later(fn: () => void): void;
  emit(type: string, detail?: Record<string, unknown>): boolean;
  schedule(): void;
  flush(): void;
  dispose(): void;
}

/** A block's root as the kit marks it: its instance under a symbol shared by every copy of the kit. */
type KitRoot = HTMLElement & { [ROOT]?: Instance };

/** A choice of a choices field (`<ul data-select>`), with the quotes under it by field name. */
interface Choice {
  id: string;
  text: string;
  correct?: boolean;
  [field: string]: unknown;
}

/** An image field (`<figure>`). */
interface Image {
  src: string;
  srcset: string;
  sizes: string;
  alt: string;
  caption: string | null;
  width: number | null;
  height: number | null;
}

/** A listener of `ctx.on` as the kit calls it: `this` is the match (or the target). */
type Handler = (this: EventTarget, event: Event, match: EventTarget) => void;

/** What `ctx.list` calls for each item, as the kit sees it. */
type ItemView = (item: HTMLElement, value: unknown, index: number) => View;

// ---------------------------------------------------------------------------------------------------------------
// The kit.
// ---------------------------------------------------------------------------------------------------------------

export const version: string = '1.0.0';
/** The blocks contract the kit speaks (`foliwake-blocks/2`, @foliwake/blocks-contract); its `ready` event names it. */
export const CONTRACT = 2;

const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const ROOT: unique symbol = Symbol.for('foliwake.block-kit.root');
let instances = 0;

const textOf = (el: Element) => el.textContent.replace(/\s+/g, ' ').trim();
const number = (img: Element | null, name: string) => (img?.hasAttribute(name) ? Number(img.getAttribute(name)) : null);

/** A promise, or any value with a `then` method (what a setup or a view's render may return). */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function';
}

function choice(li: Element): Choice {
  const copy = li.cloneNode(true) as Element;
  const item: Choice = { id: li.getAttribute('data-option-id') ?? '', text: '' };
  if (li.hasAttribute('data-correct')) item.correct = li.getAttribute('data-correct') === 'true';
  // A quote under an answer (`itemQuote`) is a child with its own data-field.
  for (const quote of copy.querySelectorAll(':scope > [data-field]')) {
    item[quote.getAttribute('data-field')!] = valueOf(quote);
    quote.remove();
  }
  item.text = textOf(copy);
  return item;
}

function image(el: Element): Image {
  const img = el.querySelector('img');
  const caption = el.querySelector('figcaption');
  const attr = (name: string) => img?.getAttribute(name) ?? '';
  return {
    src: attr('src'),
    srcset: attr('srcset'),
    sizes: attr('sizes'),
    alt: attr('alt'),
    caption: caption ? textOf(caption) : null,
    width: number(img, 'width'),
    height: number(img, 'height'),
  };
}

function valueOf(el: Element): unknown {
  switch (el.localName) {
    case 'div': // a field that may repeat: one wrapper, its occurrences inside
      return [...el.children].map(valueOf);
    case 'ul':
      return [...el.children].map((li) => (el.hasAttribute('data-select') ? choice(li) : textOf(li)));
    case 'figure':
      return image(el);
    default: // p (text), h2–h4 (heading), blockquote (quote: its paragraphs as one text)
      return textOf(el);
  }
}

/**
 * The block's fields by name, read from the engine's HTML (what `defineBlock` gives `setup`). Fields not on the
 * page are absent.
 */
export function readFields(root: Element): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const el of root.children) if (el.hasAttribute('data-field')) out[el.getAttribute('data-field')!] = valueOf(el);
  return out;
}

function fieldOf(root: Element, name: string): HTMLElement | null {
  for (const el of root.children) if (el.getAttribute('data-field') === name) return el as HTMLElement;
  return null;
}

/** The item elements of a list or choices field: `<li>`s, or the occurrences of a repeated field. */
function itemsOf(el: Element | null): HTMLElement[] {
  return el ? ([...el.children] as HTMLElement[]) : [];
}

/** Attribute values as `attrs` writes them: true → "" (aria-*: "true"), false/null/undefined → removed. */
function setAttribute(el: Element, name: string, value: AttributeValue) {
  const aria = name.startsWith('aria-');
  if (value === null || value === undefined || (value === false && !aria)) el.removeAttribute(name);
  else if (value === true) el.setAttribute(name, aria ? 'true' : '');
  else el.setAttribute(name, String(value));
}

/** The label `key`: the app's (`host.labels`), then the block's `ui` in the UI language, its base, English, the key. */
function label(host: HostMembers | undefined, meta: BlockMeta | undefined, key: string): string {
  const own = host?.labels?.[key];
  if (typeof own === 'string') return own;
  const ui = meta?.ui ?? {};
  const lang = typeof host?.uiLang === 'string' ? host.uiLang : 'en';
  for (const candidate of [lang, lang.split('-')[0], 'en']) {
    const text = ui[candidate]?.[key];
    if (typeof text === 'string') return text;
  }
  return key;
}

// One block instance: its cleanups, renders, effects and the batched update of its state.
function createInstance(root: Element, name: string, prefix: string): Instance {
  const controller = new AbortController();
  const instance: Instance = {
    controller,
    cleanups: [],
    views: [],
    effects: [],
    scheduled: false,
    readySent: false,
    handle: null,
    live: () => !controller.signal.aborted,
    later(fn) {
      if (instance.live()) instance.cleanups.push(fn);
      else fn();
    },
    emit(type, detail = {}) {
      if (!instance.live()) return false;
      const event = type.includes(':') ? type : `${prefix}:${type}`;
      const block = { key: root.getAttribute('data-block-key') ?? '', block: name };
      if (type === 'ready') instance.readySent = true;
      const full = type === 'ready' ? { contract: CONTRACT, ...detail } : detail;
      const eventInit = { bubbles: true, cancelable: true, detail: { ...block, ...full } };
      return root.dispatchEvent(new CustomEvent(event, eventInit));
    },
    schedule() {
      if (instance.scheduled || !instance.live()) return;
      instance.scheduled = true;
      queueMicrotask(() => {
        instance.scheduled = false;
        instance.flush();
      });
    },
    flush() {
      if (!instance.live()) return;
      for (const view of instance.views) view.update();
      for (const effect of instance.effects) effect.run();
    },
    dispose() {
      if (!instance.live()) return;
      controller.abort();
      const errors: unknown[] = [];
      for (const fn of instance.cleanups.splice(0).reverse()) {
        try {
          fn();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, `${errors.length} cleanups of block "${name}" failed`);
    },
  };
  return instance;
}

/** A container for `render` and `mount`: a field (by name), an element, or the root. */
function targetOf(root: HTMLElement, into: string | Element | undefined): HTMLElement {
  if (into === undefined) return root;
  if (typeof into === 'string') {
    const el = fieldOf(root, into);
    if (!el) throw new TypeError(`into: the block has no field "${into}" on this page`);
    return el;
  }
  if (into?.nodeType === 1 && root.contains(into)) return into as HTMLElement;
  throw new TypeError('into: a field name or an element inside the block');
}

/** `ctx.on`'s arguments: `([target,] type, [selector,] handler)`, the target defaulting to the root. */
function listenerArgs(root: HTMLElement, args: unknown[]) {
  const target = (typeof args[0] === 'string' ? root : args.shift()) as EventTarget;
  const listener = typeof args[1] === 'function' ? [args[0], null, args[1]] : args;
  const [type, selector, handler] = listener as [string, string | null, Handler];
  return { target, type, selector, handler };
}

function createContext(
  root: HTMLElement,
  host: HostMembers | undefined,
  meta: BlockMeta | undefined,
  name: string,
  instance: Instance,
): BlockContext<string> {
  const { signal } = instance.controller;
  const key = typeof host?.keyOf === 'function' ? host.keyOf(root) : root.getAttribute('data-block-key') ?? '';
  const rendered = new WeakSet<HTMLElement>();
  const id = instances++;
  // A view of `template()` in `container`, re-rendered on every state change; `first` is its first result
  // when the caller already has it.
  const view = (container: HTMLElement, template: () => View, first = template()) => {
    if (rendered.has(container)) throw new Error('render: this element already has a view of the block');
    rendered.add(container);
    const update = () => {
      if (instance.live()) renderTemplate(template(), container);
    };
    instance.views.push({ update });
    renderTemplate(first, container);
    instance.later(() => renderTemplate(nothing, container));
    return update;
  };
  const ctx: BlockContext<string> = {
    root,
    // Without a host (an editor, a test) `ctx.host` is undefined, as BlockInit documents.
    host: host as Host,
    key,
    signal,
    fields: readFields(root),
    field: (fieldName) => fieldOf(root, fieldName),
    id: (suffix = '') => `${name}-${id}${suffix ? `-${suffix}` : ''}`,
    attrs(el, values) {
      for (const [attribute, value] of Object.entries(values)) setAttribute(el, attribute, value);
      return el;
    },
    on(...args: unknown[]) {
      const { target, type, selector, handler } = listenerArgs(root, args);
      const listener = (event: Event) => {
        if (!selector) return handler.call(target, event, target);
        const match = (event.target as Element | null)?.closest?.(selector);
        if (match && ((target as Partial<Node>).contains?.(match) ?? true)) handler.call(match, event, match);
      };
      target.addEventListener(type, listener, { signal });
      return () => target.removeEventListener(type, listener);
    },
    emit: (type: string, detail?: Record<string, unknown>) => instance.emit(type, detail),
    t: (labelKey) => label(host, meta, labelKey),
    state<T>(initial: T) {
      let value = initial;
      return {
        get value() {
          return value;
        },
        set value(next) {
          if (!instance.live() || Object.is(next, value)) return;
          value = next;
          instance.schedule();
        },
      };
    },
    effect(fn) {
      let cleanup: void | (() => void) | null = null;
      const effect = {
        run() {
          if (typeof cleanup === 'function') cleanup();
          cleanup = fn();
        },
      };
      instance.effects.push(effect);
      effect.run();
      instance.later(() => {
        if (typeof cleanup === 'function') cleanup();
      });
    },
    render: (template, options = {}) => view(targetOf(root, options.into), template),
    list(fieldName: string, fn: ItemView) {
      const items = itemsOf(fieldOf(root, fieldName));
      const values = ctx.fields[fieldName];
      items.forEach((item, index) => {
        const value = Array.isArray(values) ? values[index] : undefined;
        const first = fn(item, value, index);
        if (first !== undefined) view(item, () => fn(item, value, index), first);
      });
      return items;
    },
    mount: (adapter, props, options = {}) => mountView(root, instance, adapter, props, options),
  };
  return ctx;
}

/**
 * Mounts a view of another framework into the block: `adapter.render(element, props, { fail })` and
 * `adapter.unmount(element)`. With `replace`, the authored children are hidden while it shows and come back
 * when it fails or the block is disposed. Every render (the first and each `update`) is guarded: one that
 * throws, rejects or reports `fail` rolls back — the element goes, the authored HTML is shown again, `onError`
 * and the block's `error` event (BLOCK_MOUNT_FAILED) report it. Once `render` was called the adapter owns the
 * element: `unmount` runs exactly once on dispose or failure, after a render still in progress has settled.
 */
function mountView<Props>(
  root: HTMLElement,
  instance: Instance,
  adapter: ViewAdapter<Props>,
  props: Props,
  options: ViewOptions<Props>,
): ViewHandle<Props> {
  const element = root.ownerDocument.createElement('div');
  element.setAttribute('data-island', '');
  targetOf(root, options.into).append(element);
  const hideable = (el: HTMLElement) => el !== element && !el.hidden && !el.contains(element);
  const hidden = options.replace ? ([...root.children] as HTMLElement[]).filter(hideable) : [];
  for (const el of hidden) el.hidden = true;
  let state = 'mounting'; // mounting → ready, or failed / disposed for good
  let owned = false; // render was called: the adapter may hold resources on the element
  const outstanding = new Set<Promise<unknown>>(); // renders that returned a promise and have not settled
  const over = () => state === 'failed' || state === 'disposed';
  const restore = () => {
    element.remove();
    for (const el of hidden) el.hidden = false;
  };
  let rendering = 0; // render calls that have not returned yet
  const afterRender: Array<() => void> = []; // teardowns asked for while a render call ran (it may dispose the block)
  const unmountAfterOutstanding = () => {
    Promise.allSettled([...outstanding]).then(() => adapter.unmount(element));
  };
  // Unmounts once, after every render in progress settled (an adapter that is still allocating finishes first).
  // Asked for while a render call is running (it aborted host.signal, say), it waits for that call to return,
  // so the render's own promise is among those awaited.
  const teardown = () => {
    if (!owned) return;
    owned = false;
    if (rendering > 0) afterRender.push(unmountAfterOutstanding);
    else unmountAfterOutstanding();
  };
  const handle: ViewHandle<Props> = {
    element,
    update(next) {
      if (!over()) render(next);
    },
    dispose() {
      if (over()) return;
      state = 'disposed';
      restore();
      teardown();
    },
    fail(error) {
      if (over()) return;
      state = 'failed';
      restore();
      // Scheduled before any callback runs, so a throwing listener or onError cannot skip it. Later: a framework
      // may report the error while it renders (React's onUncaughtError), when unmounting is not allowed.
      setTimeout(teardown);
      const message = error instanceof Error ? error.message : String(error);
      instance.emit('error', { code: 'BLOCK_MOUNT_FAILED', message, recoverable: true });
      options.onError?.(error);
    },
  };
  const settle = () => {
    if (state !== 'mounting') return;
    state = 'ready';
    options.onReady?.(handle);
  };
  // Registers a promise a render returned (teardown waits for it); runs the teardowns asked for during the call.
  const returned = (out: unknown) => {
    rendering -= 1;
    if (isThenable(out)) {
      const settled = Promise.resolve(out);
      outstanding.add(settled);
      const done = () => outstanding.delete(settled);
      settled.then(done, done);
    }
    if (rendering === 0) for (const fn of afterRender.splice(0)) fn();
  };
  function render(next: Props) {
    owned = true;
    rendering += 1;
    let out;
    try {
      out = adapter.render(element, next, { fail: handle.fail });
    } catch (error) {
      returned(undefined);
      handle.fail(error);
      return;
    }
    returned(out);
    if (!isThenable(out)) {
      settle();
      return;
    }
    Promise.resolve(out).then(settle, handle.fail);
  }
  instance.later(handle.dispose);
  render(props);
  return handle;
}

/**
 * The block `name` (its folder, `data-component`): `setup(fields, ctx)` runs once per root and may return a
 * cleanup function or `{dispose}`, or a promise of either. The result is the block's `init(root, host, meta)`
 * for the loader, idempotent per root; `host.signal` aborting disposes it. After a setup that did not send
 * `ready`, the kit sends it.
 *
 * Options: `prefix`, the prefix of the block's events (default `block`); `autoReady`, whether the kit sends
 * `ready` after a setup that did not (default `true`). With `autoReady: false` a root gets `ready` only when the
 * block sends it (`ctx.emit('ready', …)`), so a setup that cannot run (an unknown form, a missing host member)
 * leaves the root without `ready`.
 */
export function defineBlock<Name extends string>(
  name: Name,
  setup: (fields: Fields<Name>, ctx: BlockContext<Name>) => SetupResult | Promise<SetupResult>,
  options: { prefix?: string; autoReady?: boolean } = {},
): BlockInit {
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw new TypeError(`defineBlock: "${name}" is not a block name ([a-z][a-z0-9-], at most 32)`);
  }
  if (typeof setup !== 'function') throw new TypeError('defineBlock: setup must be a function (fields, ctx) => …');
  const prefix = options.prefix ?? 'block';
  const autoReady = options.autoReady ?? true;
  function init(root: KitRoot, host?: HostMembers, meta?: BlockMeta): Disposable | Promise<Disposable> {
    const known = root[ROOT];
    if (known?.handle) return known.handle;
    const instance = createInstance(root, name, prefix);
    root[ROOT] = instance;
    const handle = { dispose: () => instance.dispose() };
    const signal = host?.signal;
    if (signal?.aborted) {
      instance.dispose();
      return (instance.handle = handle);
    }
    signal?.addEventListener?.('abort', handle.dispose, { signal: instance.controller.signal });
    const adopt = (out: SetupResult) => {
      if (typeof out === 'function') instance.later(out);
      else if (typeof out?.dispose === 'function') instance.later(() => out.dispose());
      if (autoReady && instance.live() && !instance.readySent) instance.emit('ready', {});
      return handle;
    };
    const failed = () => {
      instance.dispose();
      if (root[ROOT] === instance) delete root[ROOT]; // a failed setup may run again
    };
    let out;
    try {
      // The context is typed by the block's name only for its author: at run time every block's is the same.
      const ctx = createContext(root, host, meta, name, instance) as BlockContext<Name>;
      out = setup(ctx.fields, ctx);
    } catch (error) {
      failed();
      throw error;
    }
    if (!isThenable(out)) return (instance.handle = adopt(out));
    const disposed = new Promise<Disposable>((resolve) => {
      instance.controller.signal.addEventListener('abort', () => instance.failed || resolve(handle));
    });
    const settled = out.then(adopt, (error) => {
      if (!instance.live()) return handle;
      instance.failed = true; // the rejection wins over the dispose it causes
      failed();
      throw error;
    });
    return (instance.handle = Promise.race([settled, disposed]));
  }
  Object.defineProperty(init, 'block', { value: name, enumerable: true });
  // The contract major the block speaks: a loader refuses a block of another major (LOADER_BLOCK_CONTRACT).
  Object.defineProperty(init, 'contract', { value: CONTRACT, enumerable: true });
  return init as BlockInit;
}
