// Browser harness for @foliwake/client without any framework (test/client-browser.test.js): plain DOM
// elements, mountFoliwakePage, update and dispose. The test drives window.harness and reads window.__log /
// __events / __status / __errors.
import { cssMounts, mountFoliwakePage, subscribeBlockEvents } from '@foliwake/client';

const CDS = { a: `cd_${'a1'.repeat(16)}`, b: `cd_${'b2'.repeat(16)}`, slow: `cd_${'c3'.repeat(16)}`, major3: `cd_${'d4'.repeat(16)}`, sync: `cd_${'e5'.repeat(16)}` };
const page = (name, cd, extra = {}) => ({
  identity: `demo|live|/${name}|"e1"|${cd}|practice`, site: 'demo', channel: 'live', path: `/${name}`, mode: 'practice',
  html: `<h2>${name}</h2><div data-component="quiz"><p>Q ${name}</p></div>`, codeRelease: cd, htmlContract: '2', lang: 'en',
  blocks: ['quiz'], blocksUrl: `/foliwake-code/${cd}/scripts/blocks.js`, codeBase: `/foliwake-code/${cd}/`,
  contract: { major: 2, eventPrefix: 'demo' }, preload: [], ...extra,
});
const PAGES = {
  one: page('one', CDS.a), two: page('two', CDS.a), other: page('other', CDS.b), slow: page('slow', CDS.slow), major3: page('major3', CDS.major3),
  sync: page('sync', CDS.sync),
  // A body with a custom element whose connectedCallback runs page code during the body insertion.
  probe: page('probe', CDS.a, { html: '<h2>probe</h2><abort-probe></abort-probe><div data-component="quiz"><p>Q</p></div>' }),
  plain1: page('plain1', null, { codeRelease: null, blocksUrl: null, codeBase: null }),
  oneNewEtag: page('one', CDS.a, { identity: `demo|live|/one|"e2"|${CDS.a}|practice` }),
  // The same envelope prepared to another final body: the identity carries a digest of it.
  oneDigestA: page('one', CDS.a, { identity: `demo|live|/one|"e1"|${CDS.a}|practice|sha-aaa` }),
  oneDigestB: page('one', CDS.a, { identity: `demo|live|/one|"e1"|${CDS.a}|practice|sha-bbb`, html: '<h2>one, rewritten</h2><div data-component="quiz"><p>Q one</p></div>' }),
  // Same identity as oneDigestA (another object, e.g. a re-render with fresh props).
  oneDigestAAgain: page('one', CDS.a, { identity: `demo|live|/one|"e1"|${CDS.a}|practice|sha-aaa` }),
};
window.__hooks = [];
const PHASES = ['beforeBlocks', 'afterFirstSection', 'lazy', 'delayed'];
const recordingHooks = (failing) => Object.fromEntries(['template', 'site'].map((level) => [level, Object.fromEntries(PHASES.map((phase) => [phase, async ({ container, signal }) => {
  if (phase === 'beforeBlocks' && level === 'site') await new Promise((r) => setTimeout(r, 50)); // awaited before the template's
  window.__hooks.push([level, phase, container.querySelectorAll('button.fw').length, signal.aborted]);
  if (failing && level === 'site' && phase === 'beforeBlocks') throw new Error('boom');
}]))]));
// A site beforeBlocks hook that takes 1 s and then records whether its mount was disposed meanwhile.
const slowHooks = () => ({
  site: { beforeBlocks: async ({ signal }) => { await new Promise((r) => setTimeout(r, 1000)); window.__hooks.push(['site', 'beforeBlocks', 'resumed', signal.aborted]); } },
  template: Object.fromEntries(PHASES.map((phase) => [phase, () => { window.__hooks.push(['template', phase]); }])),
});
window.__onMount = [];
window.__connected = 0;
window.__attrs = [];
window.__unhandled = [];
window.addEventListener('unhandledrejection', (e) => window.__unhandled.push(String(e.reason?.message ?? e.reason)));
// A custom-element container that reports attribute writes (attributeChangedCallback runs synchronously).
customElements.define('attr-probe', class extends HTMLElement {
  static get observedAttributes() { return ['data-foliwake-body', 'data-html-contract']; }
  attributeChangedCallback(name) {
    window.__attrs.push(name);
    if (name === 'data-foliwake-body') window.__onAttr?.();
  }
});
customElements.define('abort-probe', class extends HTMLElement {
  connectedCallback() {
    window.__connected += 1;
    window.__onConnect?.();
  }
});
window.__events = []; window.__status = []; window.__errors = []; window.__log ??= [];
window.cssMounts = () => cssMounts(document);

const mounts = new Map();
const callbacks = (name, { tag = 'v1', label = 'Check', saved = {}, requireBlocks = false, abortOnMounting = null, disposeOnEvent = null, coreOnly = false } = {}) => ({
  host: { shell: 'harness', labels: { check: label }, saved: (key) => saved[key] ?? null },
  events: coreOnly ? undefined : ['answer'], // an assessment event type besides the core ready and error
  onEvent: (e) => {
    window.__events.push([tag, e.type, e.detail.key, e.detail.saved ?? null]);
    if (disposeOnEvent) disposeOnEvent();
  },
  onStatus: (s) => {
    window.__status.push([name, s]);
    if (s === 'mounting' && abortOnMounting) abortOnMounting();
  },
  onMount: () => window.__onMount.push(name),
  onError: (err) => window.__errors.push([name, err.code]),
  requireBlocks,
});

window.harness = {
  /** A new empty element (or the existing one under `id`) and a mount of PAGES[name] into it. */
  mount(id, name, opts = {}) {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement(opts.tag ?? 'section');
      element.id = id;
      document.getElementById('root').append(element);
    }
    const controller = opts.signal || opts.abortOnMounting || opts.abortOnConnect || opts.abortOnAttr || opts.loader ? new AbortController() : null;
    window.__onConnect = opts.abortOnConnect ? () => controller.abort() : null;
    window.__onAttr = opts.abortOnAttr ? () => controller.abort() : null;
    // A custom loader that aborts the mount, then throws or returns a rejected promise.
    const blocks = opts.loader === 'abortThrow' ? () => { controller.abort(); throw new Error('loader threw'); }
      : opts.loader === 'abortReject' ? () => { controller.abort(); return Promise.reject(new Error('loader rejected')); }
      : undefined;
    const holder = {};
    // reenter: when the first session is disposed (its signal aborts), call dispose() or update({ page }) on
    // the mount from inside that disposal (re-entrancy through a hook's abort listener).
    const reentering = opts.reenter ? { site: { beforeBlocks: ({ signal }) => {
      if (holder.reentered) return;
      signal.addEventListener('abort', () => {
        holder.reentered = true;
        if (opts.reenter === 'dispose') holder.mount.dispose();
        else holder.mount.update({ page: PAGES[opts.reenter] });
      }, { once: true });
    } } } : undefined;
    const hooks = reentering ?? (opts.hooks === 'slow' ? slowHooks() : opts.hooks ? recordingHooks(opts.hooks === 'failing') : undefined);
    const extra = {
      abortOnMounting: opts.abortOnMounting ? () => controller.abort() : null,
      disposeOnEvent: opts.disposeOnEvent ? () => holder.mount?.dispose() : null,
    };
    const mount = mountFoliwakePage(element, { page: PAGES[name], ...callbacks(name, { ...opts, ...extra }), hooks, stylesheets: opts.stylesheets ?? false, body: opts.body, signal: controller?.signal, blocks, nonce: opts.nonce });
    holder.mount = mount;
    mounts.set(id, { mount, controller });
    return mount.status;
  },
  update(id, patch) {
    const { mount } = mounts.get(id);
    const name = patch.page ?? mount.page.path.slice(1);
    mount.update({ ...callbacks(name, patch), ...(patch.page ? { page: PAGES[patch.page] } : {}) });
  },
  dispose(id) { mounts.get(id).mount.dispose(); },
  abort(id) { mounts.get(id).controller.abort(); },
  status(id) { return mounts.get(id).mount.status; },
  remove(id) { document.getElementById(id).remove(); },
  /** An element rendered by "the server" (the body already inside), like an SSR page. */
  serverRendered(id, name) {
    const element = document.createElement('div');
    element.id = id;
    element.innerHTML = PAGES[name].html;
    element.dataset.ssr = 'yes';
    document.getElementById('root').append(element);
  },
  /** n subscribe/unsubscribe cycles against one long-lived signal; returns its listeners left attached. */
  subscribeCycles(id, n) {
    const controller = new AbortController();
    const live = new Set();
    const { signal } = controller;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (type, fn, o) => { live.add(fn); add(type, fn, o); };
    signal.removeEventListener = (type, fn, o) => { live.delete(fn); remove(type, fn, o); };
    for (let i = 0; i < n; i += 1) {
      const stop = subscribeBlockEvents(document.getElementById(id), {}, { prefix: 'demo', signal });
      stop();
      stop(); // idempotent
    }
    return live.size;
  },
  subscribe(id) {
    const seen = [];
    window.__subscribed = seen;
    return subscribeBlockEvents(document.getElementById(id), { answer: (e) => seen.push(e.detail.key) }, { prefix: 'demo', types: ['answer'] });
  },
};
