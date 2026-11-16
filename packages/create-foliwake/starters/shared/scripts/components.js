// Component loader (content-components.md §8.3, HTML contract 1).
//
// Finds every [data-component] root, loads only the assets that
// components/components.json declares, calls each module's default
// `init(root, host, meta)` once per root (`meta`: the block's name and its `ui`
// labels from the descriptor) and marks the root with
// data-component-status="loading" | "ready" | "error". A component stylesheet
// the page shell already links (link[data-component-css="<name>"]) is reused
// when its outcome is known (see shellCss), not added again.
//
// Failure codes (logged as console.error('[components]', code, name, root, error)):
//   LOADER_DESCRIPTOR_FAILED  components.json could not be fetched or is not a valid descriptor
//   LOADER_CONTRACT_MISMATCH  descriptor htmlContract differs from <html data-html-contract>
//   LOADER_UNKNOWN_COMPONENT  the root's name is not declared in the descriptor
//   LOADER_CSS_FAILED         the component stylesheet failed (`error` event, or a failed request of a shell link)
//   LOADER_JS_FAILED          import() of the component module rejected (404, syntax error, ...)
//   LOADER_INIT_INVALID       the module has no default export function
//   LOADER_BLOCK_NAME_MISMATCH the module's defineBlock('<name>', …) names another block than its folder
//   LOADER_BLOCK_CONTRACT     the module declares another major of the blocks contract (`init.contract`)
//   LOADER_INIT_FAILED        init(root, host) threw synchronously or returned a rejected Promise
//
// `host` is the page's BlockHost (blocks contract foliwake-blocks/2 §2, @foliwake/blocks-contract):
// the core one of a Foliwake page, the same object for every block. Inside a React or Next app
// (@foliwake/react) the same blocks get the app's host instead (its labels, `host.react`, an extension's
// members, …), so a block that reads only what this host has works in both. Optional members (`mode`,
// `media`, `track`, `labels`, `react`, any extension's) are absent here: `has(name)` says so, and a block
// falls back.
//
// In <html data-env="local|preview"> each failed root also gets a visible
// notice immediately before it. In "live" failures go to the console only.
// The loader never removes or hides authored content and exports nothing.

const codeBase = new URL('../', import.meta.url);
const descriptorUrl = new URL('components/components.json', codeBase);
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** The major of the blocks contract this loader speaks; a block that declares another one is refused. */
const BLOCKS_CONTRACT_MAJOR = 2;

const html = document.documentElement;
const prefers = (query) => typeof matchMedia === 'function' && matchMedia(query).matches;
const theme = html.dataset.theme === 'dark' || html.dataset.theme === 'light' ? html.dataset.theme : prefers('(prefers-color-scheme: dark)') ? 'dark' : 'light';
const host = Object.freeze({
  contract: Object.freeze({ major: BLOCKS_CONTRACT_MAJOR, minor: 0 }),
  shell: 'foliwake',
  htmlContract: html.dataset.htmlContract ?? '',
  channel: html.dataset.env === 'live' ? 'live' : 'preview',
  env: html.dataset.env,
  lang: html.lang || 'en',
  uiLang: html.lang || 'en',
  theme,
  reducedMotion: prefers('(prefers-reduced-motion: reduce)'),
  signal: new AbortController().signal, // a page never disposes its blocks
  keyOf: (root) => root.getAttribute('data-block-key') ?? '',
  has: (feature) => feature === 'signal' || feature === 'channel',
});

const initialized = new WeakSet();
const cssPromises = new Map();
const modulePromises = new Map();

function assetUrl(name, ext) {
  return new URL(`components/${name}/${name}.${ext}`, codeBase);
}

function showNotices() {
  const env = document.documentElement.dataset.env;
  return env === 'local' || env === 'preview';
}

function fail(root, name, code, error) {
  console.error('[components]', code, name, root, error);
  root.setAttribute('data-component-status', 'error');
  if (!showNotices()) return;
  const previous = root.previousElementSibling;
  if (previous && previous.matches('p[data-component-error]')) return; // one notice per root
  const notice = document.createElement('p');
  notice.className = 'component-error';
  notice.setAttribute('role', 'alert');
  notice.setAttribute('data-component-error', name);
  notice.style.outline = '2px solid #b00020';
  notice.style.outlineOffset = '2px';
  notice.textContent = `Component "${name}" failed (${code}). See the browser console.`;
  root.before(notice);
}

class LoaderError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.code = code;
  }
}

// The outcome of a stylesheet request from its resource timing entry: true
// (2xx), false (4xx/5xx) or null when it cannot be known (no entry yet, timings
// cleared or the buffer full, no responseStatus support, or status 0: a
// network error and a hidden cross-origin status, also after a same-origin URL
// redirects elsewhere, look the same). The sheet is never used: Chrome gives a
// failed link an empty sheet too.
function timingOutcome(href) {
  const entry = performance.getEntriesByName(href, 'resource').at(-1);
  const status = entry?.responseStatus;
  if (typeof status !== 'number' || status === 0) return null;
  return status >= 200 && status < 300;
}

// Component stylesheets the page shell links, with their outcome taken when
// the loader starts: the shell links come before this module script, so the
// browser has finished them, and the timing entries are read before anything
// else on the page can clear them. Outcome null (not known) means the loader
// adds a fresh link for that component and tracks it itself (one more request)
// rather than guessing.
const shellCss = new Map(); // name -> true | false | null
for (const link of document.querySelectorAll('link[rel="stylesheet"][data-component-css]')) {
  const name = link.getAttribute('data-component-css');
  if (!shellCss.has(name)) shellCss.set(name, timingOutcome(link.href));
}

function addCss(name) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-component-css', name);
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => {
      reject(new LoaderError('LOADER_CSS_FAILED', `Stylesheet for "${name}" failed to load.`));
    }, { once: true });
    link.href = assetUrl(name, 'css').href;
    document.head.append(link);
  });
}

function loadCss(name) {
  if (!cssPromises.has(name)) {
    const known = shellCss.get(name);
    const promise = known === true
      ? Promise.resolve()
      : known === false
        ? Promise.reject(new LoaderError('LOADER_CSS_FAILED', `Stylesheet for "${name}" failed to load.`))
        : addCss(name);
    promise.catch(() => {}); // handled per root
    cssPromises.set(name, promise);
  }
  return cssPromises.get(name);
}

function loadModule(name) {
  if (!modulePromises.has(name)) {
    const promise = import(assetUrl(name, 'js').href).then(
      (module) => {
        if (typeof module.default !== 'function') {
          throw new LoaderError('LOADER_INIT_INVALID', `Module for "${name}" has no default export function.`);
        }
        // block-kit's init carries the name given to defineBlock; a hand-written init has none.
        const declared = module.default.block;
        if (typeof declared === 'string' && declared !== name) {
          throw new LoaderError('LOADER_BLOCK_NAME_MISMATCH', `Module for "${name}" defines the block "${declared}".`);
        }
        // A declared contract major (block-kit sets it) must be this loader's; none declared is accepted.
        const contract = module.default.contract;
        if (contract !== undefined && contract !== BLOCKS_CONTRACT_MAJOR) {
          const speaks = `foliwake-blocks/${contract}`;
          const expected = `foliwake-blocks/${BLOCKS_CONTRACT_MAJOR}`;
          throw new LoaderError('LOADER_BLOCK_CONTRACT', `Module for "${name}" speaks ${speaks}; this page loads ${expected}.`);
        }
        return module.default;
      },
      (error) => {
        throw new LoaderError('LOADER_JS_FAILED', `Module for "${name}" failed to load.`, error);
      },
    );
    promise.catch(() => {});
    modulePromises.set(name, promise);
  }
  return modulePromises.get(name);
}

async function fetchDescriptor() {
  let descriptor;
  try {
    const response = await fetch(descriptorUrl);
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${response.status}`);
    }
    descriptor = await response.json();
  } catch (error) {
    throw new LoaderError('LOADER_DESCRIPTOR_FAILED', 'Component descriptor could not be loaded.', error);
  }
  const valid = descriptor !== null && typeof descriptor === 'object'
    && descriptor.components !== null && typeof descriptor.components === 'object'
    && !Array.isArray(descriptor.components);
  if (!valid) {
    throw new LoaderError('LOADER_DESCRIPTOR_FAILED', 'Component descriptor is not valid.');
  }
  if (String(descriptor.htmlContract) !== document.documentElement.dataset.htmlContract) {
    throw new LoaderError(
      'LOADER_CONTRACT_MISMATCH',
      `Descriptor htmlContract ${descriptor.htmlContract} does not match page contract ${document.documentElement.dataset.htmlContract}.`,
    );
  }
  return descriptor;
}

// What the block learns about itself from the descriptor (blocks contract BlockMeta).
function metaOf(name, entry) {
  const ui = entry.ui !== null && typeof entry.ui === 'object' && !Array.isArray(entry.ui) ? entry.ui : undefined;
  return Object.freeze(ui ? { name, ui } : { name });
}

function errorCode(error) {
  return error instanceof LoaderError ? error.code : 'LOADER_INIT_FAILED';
}

// One root: init (if JS) and CSS are tracked independently; the root is
// "ready" only when both succeeded, "error" as soon as either fails.
async function processRoot(root, name, entry) {
  const css = entry.css === true ? loadCss(name) : Promise.resolve();
  const js = entry.js === true
    ? loadModule(name).then((init) => Promise.resolve().then(() => init(root, host, metaOf(name, entry))).catch((error) => {
      throw error instanceof LoaderError ? error : new LoaderError('LOADER_INIT_FAILED', `init failed for "${name}".`, error);
    }))
    : Promise.resolve();

  let failed = false;
  const report = (error) => {
    failed = true;
    fail(root, name, errorCode(error), error instanceof LoaderError && error.cause !== undefined ? error.cause : error);
  };
  await Promise.allSettled([css.catch(report), js.catch(report)]);
  if (!failed) root.setAttribute('data-component-status', 'ready');
}

function collectRoots() {
  const roots = [];
  for (const root of document.querySelectorAll('[data-component]')) {
    if (initialized.has(root) || root.hasAttribute('data-component-status')) continue;
    initialized.add(root);
    root.setAttribute('data-component-status', 'loading');
    roots.push(root);
  }
  return roots;
}

async function run() {
  // Collect and mark synchronously, so a second copy of the loader (even at a
  // different URL) sees the status attribute and skips these roots.
  const roots = collectRoots();
  if (roots.length === 0) return;

  let descriptor;
  try {
    descriptor = await fetchDescriptor();
  } catch (error) {
    for (const root of roots) fail(root, root.dataset.component, error.code, error.cause ?? error);
    return;
  }

  const byName = new Map();
  for (const root of roots) {
    const name = root.dataset.component;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(root);
  }

  const work = [];
  for (const [name, nameRoots] of byName) {
    const declared = NAME_PATTERN.test(name) && Object.hasOwn(descriptor.components, name);
    const entry = declared ? descriptor.components[name] : null;
    if (!entry || typeof entry !== 'object') {
      const error = new LoaderError('LOADER_UNKNOWN_COMPONENT', `Component "${name}" is not declared in components.json.`);
      for (const root of nameRoots) fail(root, name, error.code, error);
      continue;
    }
    for (const root of nameRoots) work.push(processRoot(root, name, entry));
  }
  await Promise.allSettled(work);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { run(); }, { once: true });
} else {
  run();
}
