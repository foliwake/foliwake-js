// Foliwake block-kit (https://docs.foliwake.dev/guide/write-a-block): the module `foliwake` that site blocks import,
//
//   import { defineBlock, html } from 'foliwake';
//
// The engine maps the bare specifier to `<code release>/_foliwake/block-kit.js` with an import map in every
// page it composes, and adds this file (with the vendored lit-html next to it) to every code release, so a
// release always runs the kit it was prepared and tested with. No build step, no other dependency.
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

export { html, nothing };

export const version = '1.0.0';
/** The blocks contract the kit speaks (`foliwake-blocks/2`, @foliwake/blocks-contract); its `ready` event names it. */
export const CONTRACT = 2;

const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const ROOT = Symbol.for('foliwake.block-kit.root');
let instances = 0;

const textOf = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const number = (img, name) => (img?.hasAttribute(name) ? Number(img.getAttribute(name)) : null);

function choice(li) {
  const copy = li.cloneNode(true);
  const item = { id: li.getAttribute('data-option-id') ?? '', text: '' };
  if (li.hasAttribute('data-correct')) item.correct = li.getAttribute('data-correct') === 'true';
  // A quote under an answer (`itemQuote`) is a child with its own data-field.
  for (const quote of copy.querySelectorAll(':scope > [data-field]')) {
    item[quote.getAttribute('data-field')] = valueOf(quote);
    quote.remove();
  }
  item.text = textOf(copy);
  return item;
}

function image(el) {
  const img = el.querySelector('img');
  const caption = el.querySelector('figcaption');
  const attr = (name) => img?.getAttribute(name) ?? '';
  return { src: attr('src'), srcset: attr('srcset'), sizes: attr('sizes'), alt: attr('alt'), caption: caption ? textOf(caption) : null, width: number(img, 'width'), height: number(img, 'height') };
}

function valueOf(el) {
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

/** The block's fields by name, read from the engine's HTML. Fields not on the page are absent. */
export function readFields(root) {
  const out = {};
  for (const el of root.children) if (el.hasAttribute('data-field')) out[el.getAttribute('data-field')] = valueOf(el);
  return out;
}

function fieldOf(root, name) {
  for (const el of root.children) if (el.getAttribute('data-field') === name) return el;
  return null;
}

/** The item elements of a list or choices field: `<li>`s, or the occurrences of a repeated field. */
function itemsOf(el) {
  return el ? [...el.children] : [];
}

/** Attribute values as `attrs` writes them: true → "" (aria-*: "true"), false/null/undefined → removed. */
function setAttribute(el, name, value) {
  const aria = name.startsWith('aria-');
  if (value === null || value === undefined || (value === false && !aria)) el.removeAttribute(name);
  else if (value === true) el.setAttribute(name, aria ? 'true' : '');
  else el.setAttribute(name, String(value));
}

/** The label `key`: the app's (`host.labels`), then the block's `ui` in the UI language, its base, English, the key. */
function label(host, meta, key) {
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
function createInstance(root, name, prefix) {
  const controller = new AbortController();
  const instance = {
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
      return root.dispatchEvent(new CustomEvent(event, { bubbles: true, cancelable: true, detail: { ...block, ...full } }));
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
      const errors = [];
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
function targetOf(root, into) {
  if (into === undefined) return root;
  if (typeof into === 'string') {
    const el = fieldOf(root, into);
    if (!el) throw new TypeError(`into: the block has no field "${into}" on this page`);
    return el;
  }
  if (into?.nodeType === 1 && root.contains(into)) return into;
  throw new TypeError('into: a field name or an element inside the block');
}

function createContext(root, host, meta, name, instance) {
  const { signal } = instance.controller;
  const key = typeof host?.keyOf === 'function' ? host.keyOf(root) : root.getAttribute('data-block-key') ?? '';
  const rendered = new WeakSet();
  const id = instances++;
  // A view of `template()` in `container`, re-rendered on every state change; `first` is its first result
  // when the caller already has it.
  const view = (container, template, first = template()) => {
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
  const ctx = {
    root,
    host,
    key,
    signal,
    fields: readFields(root),
    field: (fieldName) => fieldOf(root, fieldName),
    id: (suffix = '') => `${name}-${id}${suffix ? `-${suffix}` : ''}`,
    attrs(el, values) {
      for (const [attribute, value] of Object.entries(values)) setAttribute(el, attribute, value);
      return el;
    },
    on(...args) {
      const target = typeof args[0] === 'string' ? root : args.shift();
      const [type, selector, handler] = typeof args[1] === 'function' ? [args[0], null, args[1]] : args;
      const listener = (event) => {
        if (!selector) return handler.call(target, event, target);
        const match = event.target?.closest?.(selector);
        if (match && (target.contains?.(match) ?? true)) handler.call(match, event, match);
      };
      target.addEventListener(type, listener, { signal });
      return () => target.removeEventListener(type, listener);
    },
    emit: (type, detail) => instance.emit(type, detail),
    t: (labelKey) => label(host, meta, labelKey),
    state(initial) {
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
      let cleanup = null;
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
    list(fieldName, fn) {
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
function mountView(root, instance, adapter, props, options) {
  const element = root.ownerDocument.createElement('div');
  element.setAttribute('data-island', '');
  targetOf(root, options.into).append(element);
  const hidden = options.replace ? [...root.children].filter((el) => el !== element && !el.hidden && !el.contains(element)) : [];
  for (const el of hidden) el.hidden = true;
  let state = 'mounting'; // mounting → ready, or failed / disposed for good
  let owned = false; // render was called: the adapter may hold resources on the element
  const outstanding = new Set(); // renders that returned a promise and have not settled
  const over = () => state === 'failed' || state === 'disposed';
  const restore = () => {
    element.remove();
    for (const el of hidden) el.hidden = false;
  };
  let rendering = 0; // render calls that have not returned yet
  const afterRender = []; // teardowns asked for while a render call ran (it may dispose the block itself)
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
  const handle = {
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
      instance.emit('error', { code: 'BLOCK_MOUNT_FAILED', message: error instanceof Error ? error.message : String(error), recoverable: true });
      options.onError?.(error);
    },
  };
  const settle = () => {
    if (state !== 'mounting') return;
    state = 'ready';
    options.onReady?.(handle);
  };
  // Registers a promise a render returned (teardown waits for it); runs the teardowns asked for during the call.
  const returned = (out) => {
    rendering -= 1;
    if (typeof out?.then === 'function') {
      const settled = Promise.resolve(out);
      outstanding.add(settled);
      const done = () => outstanding.delete(settled);
      settled.then(done, done);
    }
    if (rendering === 0) for (const fn of afterRender.splice(0)) fn();
  };
  function render(next) {
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
    if (typeof out?.then !== 'function') {
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
 * `ready`, the kit sends it. Option `prefix`: the prefix of the block's events (default `block`).
 */
export function defineBlock(name, setup, options = {}) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new TypeError(`defineBlock: "${name}" is not a block name ([a-z][a-z0-9-], at most 32)`);
  if (typeof setup !== 'function') throw new TypeError('defineBlock: setup must be a function (fields, ctx) => …');
  const prefix = options.prefix ?? 'block';
  function init(root, host, meta) {
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
    const adopt = (out) => {
      if (typeof out === 'function') instance.later(out);
      else if (typeof out?.dispose === 'function') instance.later(() => out.dispose());
      if (instance.live() && !instance.readySent) instance.emit('ready', {});
      return handle;
    };
    const failed = () => {
      instance.dispose();
      if (root[ROOT] === instance) delete root[ROOT]; // a failed setup may run again
    };
    let out;
    try {
      const ctx = createContext(root, host, meta, name, instance);
      out = setup(ctx.fields, ctx);
    } catch (error) {
      failed();
      throw error;
    }
    if (typeof out?.then !== 'function') return (instance.handle = adopt(out));
    const disposed = new Promise((resolve) => instance.controller.signal.addEventListener('abort', () => instance.failed || resolve(handle)));
    const settled = out.then(adopt, (error) => {
      if (!instance.live()) return handle;
      instance.failed = true; // the rejection wins over the dispose it causes
      failed();
      throw error;
    });
    return (instance.handle = Promise.race([settled, disposed]));
  }
  Object.defineProperty(init, 'block', { value: name, enumerable: true });
  return init;
}
