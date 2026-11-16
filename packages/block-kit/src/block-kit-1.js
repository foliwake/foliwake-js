// Foliwake block-kit 1 (https://docs.foliwake.dev/guide/write-a-block): helpers for the
// JavaScript of site blocks. No dependencies, no build. A block imports it with
// a relative path, `../../_foliwake/block-kit-1.js`; the engine serves it there
// in `foliwake dev` and adds it to every code release that imports it, so each
// release keeps the exact kit it was prepared with (immutable, like its code).
// Major version in the file name; within it, changes are only additive.
//
// The per-root state lives on the root (a Symbol.for key) and the running setup
// on a global Symbol.for slot, so two copies of the
// kit on one page (a plain block and a bundled React block) share it.

export const version = '1.0.0';

const STATE = Symbol.for('foliwake.block-kit.root');
// The state of the block whose setup is running, on a global slot shared by
// every copy of the kit, so a helper of another copy called in setup (e.g. its
// on(window, …)) still ends with the block.
const CURRENT = Symbol.for('foliwake.block-kit.current');
const getCurrent = () => globalThis[CURRENT] ?? null;
const setCurrent = (state) => {
  globalThis[CURRENT] = state;
};

function stateOf(root) {
  let state = root[STATE];
  if (!state) root[STATE] = state = { controller: new AbortController(), cleanups: [], handle: null, prefix: 'block' };
  return state;
}

const live = (state) => state && !state.controller.signal.aborted;

function later(state, fn) {
  if (live(state)) state.cleanups.push(fn);
  else fn();
}

function disposeState(state) {
  if (!live(state)) return;
  state.controller.abort();
  for (const fn of state.cleanups.splice(0).reverse()) {
    try {
      fn();
    } catch (error) {
      console.error('[block-kit]', error);
    }
  }
}

const textOf = (el, html) => (html ? el.innerHTML.trim() : el.textContent.replace(/\s+/g, ' ').trim());
const number = (img, name) => (img?.hasAttribute(name) ? Number(img.getAttribute(name)) : null);

function choice(li, o) {
  const copy = li.cloneNode(true);
  const item = { id: li.getAttribute('data-option-id') ?? '', text: '' };
  if (li.hasAttribute('data-correct')) item.correct = li.getAttribute('data-correct') === 'true';
  // A quote under an answer (`itemQuote`) is a child with its own data-field.
  for (const quote of copy.querySelectorAll(':scope > [data-field]')) {
    item[quote.getAttribute('data-field')] = valueOf(quote, o);
    quote.remove();
  }
  item.text = textOf(copy, o.html);
  return item;
}

function valueOf(el, o) {
  switch (el.localName) {
    case 'div': // a field that may repeat: one wrapper, its occurrences inside
      return [...el.children].map((child) => valueOf(child, o));
    case 'ul':
      return [...el.children].map((li) => (el.hasAttribute('data-select') ? choice(li, o) : textOf(li, o.html)));
    case 'figure': {
      const img = el.querySelector('img');
      const caption = el.querySelector('figcaption');
      const attr = (name) => img?.getAttribute(name) ?? '';
      return { src: attr('src'), srcset: attr('srcset'), sizes: attr('sizes'), alt: attr('alt'), caption: caption ? textOf(caption) : null, width: number(img, 'width'), height: number(img, 'height') };
    }
    default: // p (text), h2–h4 (heading), blockquote (quote: its paragraphs as one text)
      return textOf(el, o.html);
  }
}

/** The block's fields by name, read from the engine's HTML. Fields not on the page are absent. */
export function fields(root, o = {}) {
  const out = {};
  for (const el of root.children) if (el.hasAttribute('data-field')) out[el.getAttribute('data-field')] = valueOf(el, o);
  return out;
}

/** The element of one field (`data-select`, `id` and other attributes are on it), or null. */
export function field(root, name) {
  for (const el of root.children) if (el.getAttribute('data-field') === name) return el;
  return null;
}

/**
 * Adds a listener that ends with the block: on a block root, or on any target
 * while the block's setup runs. With a selector, `handler(event, match)` runs
 * only for events inside an element of `target` matching it. Returns `off()`.
 */
export function on(target, type, selector, handler) {
  if (typeof selector === 'function') [selector, handler] = [null, selector];
  const state = target[STATE] ?? getCurrent() ?? (target.nodeType === 1 ? stateOf(target) : null);
  const listener = (event) => {
    if (!selector) return handler.call(target, event, target);
    const match = event.target?.closest?.(selector);
    if (match && (target.contains?.(match) ?? true)) handler.call(match, event, match);
  };
  target.addEventListener(type, listener, state ? { signal: state.controller.signal } : undefined);
  return () => target.removeEventListener(type, listener);
}

/**
 * Dispatches a bubbling CustomEvent `<prefix>:<type>` on the block root (a type
 * with a colon is used as it is; the prefix is defineBlock's, default "block").
 * `detail` is `{key, block, ...detail}`: `data-block-key` and the block name.
 * Nothing is sent after dispose; returns whether it was sent and not cancelled.
 */
export function emit(root, type, detail = {}) {
  const state = root[STATE];
  if (state && !live(state)) return false;
  const name = type.includes(':') ? type : `${state?.prefix ?? 'block'}:${type}`;
  const block = { key: root.getAttribute('data-block-key') ?? '', block: root.getAttribute('data-component') ?? '' };
  return root.dispatchEvent(new CustomEvent(name, { bubbles: true, cancelable: true, detail: { ...block, ...detail } }));
}

/**
 * Makes the block's `init(root, host, ...)` from `setup(root, host, ...)`
 * (the arguments are passed through). Idempotent: every call on the same root,
 * also after dispose, returns the first result; only a setup that failed
 * (threw or rejected) may run again. It returns `{dispose}`, or a
 * Promise of it when setup is async, settled at the latest when the block is
 * disposed. `host.signal` aborting disposes the block. setup may return a
 * cleanup function or `{dispose}`; one returned after dispose runs at once.
 * Options: `prefix` of emit's events; `host(root)` gives the host when the
 * caller passes none (a loader older than the blocks contract passes only `root`).
 */
export function defineBlock(setup, options = {}) {
  return function init(root, ...rest) {
    if (root[STATE]?.handle) return root[STATE].handle;
    if (rest[0] === undefined && options.host) rest[0] = options.host(root);
    const state = stateOf(root);
    if (options.prefix) state.prefix = options.prefix;
    state.host = rest[0];
    const handle = { dispose: () => disposeState(state) };
    const adopt = (out) => {
      if (typeof out === 'function') later(state, out);
      else if (typeof out?.dispose === 'function') later(state, () => out.dispose());
      return handle;
    };
    const signal = rest[0]?.signal;
    if (signal?.aborted) {
      disposeState(state);
      return (state.handle = handle);
    }
    signal?.addEventListener?.('abort', handle.dispose, { signal: state.controller.signal });
    const outer = getCurrent();
    setCurrent(state);
    let out;
    try {
      out = setup(root, ...rest);
    } catch (error) {
      disposeState(state);
      delete root[STATE];
      throw error;
    } finally {
      setCurrent(outer);
    }
    if (typeof out?.then !== 'function') return (state.handle = adopt(out));
    const disposed = new Promise((resolve) => (live(state) ? state.controller.signal.addEventListener('abort', () => state.failed || resolve(handle)) : resolve(handle)));
    const settled = out.then(adopt, (error) => {
      if (!live(state)) return handle;
      state.failed = true; // the rejection wins over the dispose it causes
      disposeState(state);
      if (root[STATE] === state) delete root[STATE]; // a failed setup may run again, as a synchronous one
      throw error;
    });
    return (state.handle = Promise.race([settled, disposed]));
  };
}

/**
 * Renders a React component into the block. React is never bundled here: pass
 * `react: {createRoot, createElement}` (or the two functions directly), or the
 * host gives them as `host.react`. Renders into a new element at the end of the
 * root, after `container`, or into `into`; `rootOptions` go to createRoot.
 * `replace: true` hides the authored children until dispose. When React reports
 * an uncaught error (React 19 `onUncaughtError`), the island is removed and the
 * authored HTML shown again, then `rootOptions.onUncaughtError` is called.
 * Returns `{root, element, update(props), dispose}`, disposed with the block.
 */
export function mountReact(root, Component, props = {}, options = {}) {
  const state = root[STATE] ?? getCurrent();
  const react = { ...state?.host?.react, ...options.react, ...options };
  if (typeof react.createRoot !== 'function' || typeof react.createElement !== 'function') {
    throw new TypeError('mountReact: no createRoot/createElement');
  }
  let element = options.into;
  if (!element) {
    element = root.ownerDocument.createElement('div');
    element.setAttribute('data-react', '');
    if (options.container) options.container.after(element);
    else root.append(element);
  }
  const hidden = options.replace ? [...root.children].filter((el) => el !== element && !el.hidden) : [];
  let done = false;
  const restore = () => {
    if (!options.into) element.remove();
    for (const el of hidden) el.hidden = false;
  };
  const rootOptions = {
    ...options.rootOptions,
    onUncaughtError(error, info) {
      restore();
      setTimeout(handle.dispose);
      if (options.rootOptions?.onUncaughtError) options.rootOptions.onUncaughtError(error, info);
      else console.error('[block-kit] React', error);
    },
  };
  const reactRoot = react.createRoot(element, rootOptions);
  const handle = {
    root: reactRoot,
    element,
    update: (next) => reactRoot.render(react.createElement(Component, next)),
    dispose() {
      if (done) return;
      done = true;
      reactRoot.unmount();
      restore();
    },
  };
  try {
    handle.update(props);
  } catch (error) {
    handle.dispose();
    throw error;
  }
  for (const el of hidden) el.hidden = true;
  if (state) later(state, handle.dispose);
  return handle;
}
