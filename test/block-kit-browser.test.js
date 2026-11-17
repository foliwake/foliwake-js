// @foliwake/block-kit in a real browser (system Chrome through playwright-core): the module `@foliwake/block-kit`
// (dist/block-kit.js with dist/lit-html.js), loaded through an import map as pages load it.
// Covers defineBlock(name, setup) and its ctx: fields of every field type, on/emit and their end on dispose,
// idempotent init, host.signal, the automatic `ready`, t() and its fallback chain, state batching,
// render/update/dispose, list over the server list, effect, mount with its rollback (also with real React 19
// through the starters' React view), a scaffolded block through the starter loader, and readFields(root).
// Ported from the engine's block-kit browser tests, with the same assertions.
//
// Fixtures (fixtures/block-kit/engine-html.json): the engine's HTML for these blocks (HTML contract 2),
// produced once by the engine's content generator (buildSite with the site-blocks pack of the `all` block,
// over the Markdown kept next to it; a generated PNG stands in for the photo) and by its dev server
// (`foliwake dev` page, components.json and the files of a block from `blocks new --js`, plus a copy of it
// in the folder `other`). This package has no content generator, so the HTML is kept as static data.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, afterEach, before, test } from 'node:test';
import { launchBrowser, openPage } from './helpers/browser.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DIST = path.join(ROOT, 'packages/block-kit/dist');
const STARTERS = path.join(ROOT, 'packages/create-foliwake/starters');
const FIXTURE = JSON.parse(await readFile(path.join(HERE, 'fixtures/block-kit/engine-html.json'), 'utf8'));
const body = FIXTURE.all.body;

let server;
let browser;
let kit;
let lit;
const contexts = [];

before(async () => {
  kit = await readFile(path.join(DIST, 'block-kit.js'), 'utf8');
  lit = await readFile(path.join(DIST, 'lit-html.js'), 'utf8');
  server = await startServer();
  browser = await launchBrowser();
});
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
  server.reset();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

/** A static server: each path answers what the test set for it; everything else is a 404. */
async function startServer() {
  const routes = new Map();
  const httpServer = http.createServer((req, res) => {
    const route = routes.get(new URL(req.url, 'http://x').pathname);
    if (!route) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': route.type, 'cache-control': 'no-store' });
    res.end(route.body);
  });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${httpServer.address().port}`;
  return {
    origin,
    set(pathname, text, type = 'text/javascript') {
      routes.set(pathname, { body: text, type });
      return `${origin}${pathname}`;
    },
    reset: () => routes.clear(),
    close: () => new Promise((resolve) => httpServer.close(resolve)),
  };
}

async function newPage() {
  const opened = await openPage(browser);
  contexts.push(opened.context);
  return opened.page;
}

/** The import map of a page: the kit under `@foliwake/block-kit`. */
const IMPORT_MAP =
  '<script type="importmap">{"imports":{"@foliwake/block-kit":"/_foliwake/block-kit.js"}}</script>';

/** A page with the generated body, the kit at /_foliwake/ and the import map (no loader). */
async function open(extra = {}) {
  server.set('/_foliwake/block-kit.js', kit);
  server.set('/_foliwake/lit-html.js', lit);
  for (const [key, value] of Object.entries(extra)) server.set(key, value);
  const head = `<meta charset="utf-8"><title>T</title>${IMPORT_MAP}`;
  const html = `<!doctype html><html lang="en"><head>${head}</head><body><main>${body}</main></body></html>`;
  const url = server.set('/page', html, 'text/html');
  const page = await newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(url);
  await page.evaluate(async () => {
    window.kit = await import('@foliwake/block-kit');
    window.events = [];
    document.addEventListener('block:ready', (e) => window.events.push(['ready', e.detail]));
    document.addEventListener('block:error', (e) => window.events.push(['error', e.detail]));
  });
  page.errors = errors;
  return page;
}

test('fields: every field type by name, as plain values; absent optional fields are absent', async () => {
  const page = await open();
  const [first, second] = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('[data-component="all"]')];
    return roots.map((root) => {
      let seen;
      window.kit.defineBlock('all', (fields) => {
        seen = fields;
      })(root);
      return seen;
    });
  });
  assert.deepEqual(Object.keys(first), ['title', 'intro', 'steps', 'options', 'quote', 'notes', 'picture']);
  assert.equal(first.title, 'A bold title');
  assert.equal(first.intro, 'Intro text.');
  assert.deepEqual(first.steps, ['One', 'Two code']);
  assert.deepEqual(first.options, [
    { id: 'a1', text: 'Left', correct: false, why: 'Not this way.' },
    { id: 'a2', text: 'Right', correct: true },
  ]);
  assert.equal(first.quote, 'First line. Second paragraph.');
  assert.deepEqual(first.notes, ['Note one.'], 'a field that may repeat is always a list');
  assert.equal(first.picture.alt, 'A road');
  assert.equal(first.picture.caption, 'The caption');
  assert.match(first.picture.srcset, /480w/);
  assert.deepEqual(second, {
    title: 'Second',
    steps: ['Only'],
    options: [{ id: 'y', text: 'Yes', correct: true }, { id: 'n', text: 'No', correct: false }],
  });
});

test('readFields(root): the same object defineBlock passes to setup, for every root; no block is set up', async () => {
  const page = await open();
  const out = await page.evaluate(() => {
    const { defineBlock, readFields } = window.kit;
    const roots = [...document.querySelectorAll('[data-component="all"]')];
    const read = roots.map((root) => readFields(root));
    const readyBefore = window.events.length;
    const given = roots.map((root) => {
      let seen;
      defineBlock('all', (fields) => {
        seen = fields;
      })(root);
      return seen;
    });
    return { read, given, readyBefore, type: typeof readFields };
  });
  assert.equal(out.type, 'function');
  assert.equal(out.readyBefore, 0, 'reading the fields sets nothing up');
  assert.deepEqual(out.read, out.given);
  assert.equal(out.read[0].title, 'A bold title');
});

test('defineBlock: a name is checked; init carries it; idempotent init; on() with a selector; '
  + 'emit() with key and block; nothing after dispose', async () => {
  const page = await open();
  const result = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const bad = ['Callout', '1x', '', 'a'.repeat(33)].map((name) => {
      try {
        defineBlock(name, () => {});
        return 'accepted';
      } catch (error) {
        return error.constructor.name;
      }
    });
    const root = document.querySelector('[data-component="all"]');
    root.setAttribute('data-block-key', 'b1');
    const clicks = [];
    const init = defineBlock('all', (fields, c) => {
      c.on('click', 'li', (event, match) => clicks.push(match.dataset.optionId ?? match.textContent.trim()));
      c.on(document, 'x-ping', () => clicks.push('ping'));
    });
    const sent = [];
    root.addEventListener('block:pick', (e) => sent.push(e.detail));
    const a = init(root);
    const b = init(root);
    root.querySelector('[data-option-id="a2"]').click();
    document.dispatchEvent(new Event('x-ping'));
    let emitted;
    defineBlock('all', (fields, c) => {
      emitted = c.emit;
    })(document.querySelectorAll('[data-component="all"]')[1]);
    a.dispose();
    root.querySelector('[data-option-id="a1"]').click();
    document.dispatchEvent(new Event('x-ping'));
    const afterDispose = init(root) === a;
    const emittedOk = emitted('pick', { n: 1 });
    return { bad, block: init.block, same: a === b, afterDispose, clicks, emittedOk, sent };
  });
  assert.deepEqual(result.bad, ['TypeError', 'TypeError', 'TypeError', 'TypeError']);
  assert.equal(result.block, 'all');
  assert.equal(result.same, true);
  assert.equal(result.afterDispose, true, 'a disposed block stays disposed');
  assert.deepEqual(result.clicks, ['a2', 'ping']);
  assert.equal(result.emittedOk, true);
});

test('ready is sent after setup when the block did not send it; not twice; '
  + 'async setup sends it when it resolves', async () => {
  const page = await open();
  const events = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const [one, two] = document.querySelectorAll('[data-component="all"]');
    one.setAttribute('data-block-key', 'one');
    two.setAttribute('data-block-key', 'two');
    defineBlock('all', () => {})(one);
    await defineBlock('all', async (fields, c) => {
      await new Promise((r) => setTimeout(r, 20));
      c.emit('ready', { restored: true });
    })(two);
    return window.events;
  });
  assert.deepEqual(events, [
    ['ready', { key: 'one', block: 'all', contract: 2 }],
    ['ready', { key: 'two', block: 'all', contract: 2, restored: true }],
  ]);
});

test('t(): host.labels, then ui of the UI language, its base language, English, then the key', async () => {
  const page = await open();
  const out = await page.evaluate(() => {
    const { defineBlock } = window.kit;
    const ui = {
      en: { more: 'More', less: 'Less', only: 'Only en' },
      ru: { more: 'Ещё' },
      'pt-BR': { less: 'Menos' },
    };
    const run = (host) => {
      const root = document.createElement('div');
      root.setAttribute('data-component', 'all');
      let t;
      defineBlock('all', (fields, c) => {
        t = c.t;
      })(root, host, { name: 'all', ui });
      return ['more', 'less', 'only', 'missing'].map((k) => t(k));
    };
    const signal = new AbortController().signal;
    return {
      ru: run({ uiLang: 'ru', signal }),
      app: run({ uiLang: 'ru', labels: { more: 'Подробнее' }, signal }),
      ptBR: run({ uiLang: 'pt-BR', signal }),
      ptPT: run({ uiLang: 'pt-PT', signal }),
      none: run(undefined),
    };
  });
  assert.deepEqual(out.ru, ['Ещё', 'Less', 'Only en', 'missing']);
  assert.deepEqual(out.app, ['Подробнее', 'Less', 'Only en', 'missing'], 'the app wins');
  assert.deepEqual(out.ptBR, ['More', 'Menos', 'Only en', 'missing']);
  assert.deepEqual(out.ptPT, ['More', 'Less', 'Only en', 'missing'], 'no pt: English');
  assert.deepEqual(out.none, ['More', 'Less', 'Only en', 'missing']);
});

test('state: changes are batched per microtask into one render; '
  + 'equal values and changes after dispose render nothing', async () => {
  const page = await open();
  const out = await page.evaluate(async () => {
    const { defineBlock, html } = window.kit;
    const root = document.querySelector('[data-component="all"]');
    let api;
    let renders = 0;
    let effects = 0;
    const handle = defineBlock('all', (fields, c) => {
      const count = c.state(0);
      c.render(() => {
        renders += 1;
        return html`<output>${count.value}</output>`;
      });
      c.effect(() => {
        effects += 1;
        const value = count.value;
        c.attrs(c.root, { 'data-count': value, 'aria-busy': value > 2, 'data-zero': value === 0 });
      });
      api = count;
    })(root);
    const text = () => root.querySelector('output').textContent;
    const first = [renders, effects, text(), root.getAttribute('data-zero')];
    api.value = 1;
    api.value = 2;
    api.value = 3;
    const sync = [renders, text()];
    await Promise.resolve();
    const batched = [
      renders,
      effects,
      text(),
      root.getAttribute('data-count'),
      root.getAttribute('aria-busy'),
      root.hasAttribute('data-zero'),
    ];
    api.value = 3;
    await Promise.resolve();
    const same = renders;
    handle.dispose();
    const gone = root.querySelector('output');
    api.value = 4;
    await Promise.resolve();
    return { first, sync, batched, same, gone, after: renders, value: api.value };
  });
  assert.deepEqual(out.first, [1, 1, '0', '']);
  assert.deepEqual(out.sync, [1, '0'], 'nothing renders synchronously');
  assert.deepEqual(out.batched, [2, 2, '3', '3', 'true', false], 'three changes, one render and one effect');
  assert.equal(out.same, 2, 'an equal value renders nothing');
  assert.equal(out.gone, null, 'dispose removes the view');
  assert.equal(out.after, 2);
  assert.equal(out.value, 3, 'after dispose a state keeps its value');
});

test('render: into the root after its children, into a field, update(); one view per element; '
  + 'list over the server list', async () => {
  const page = await open();
  const out = await page.evaluate(async () => {
    const { defineBlock, html, nothing } = window.kit;
    const root = document.querySelector('[data-component="all"]');
    let picked;
    let update;
    let twice;
    let items;
    let calls = 0;
    defineBlock('all', (fields, c) => {
      picked = c.state(null);
      update = c.render(() => html`<p class="tail">${picked.value ?? 'none'}</p>`);
      c.render(() => html`<span class="in-title">!</span>`, { into: 'title' });
      try {
        c.render(() => html`x`, { into: 'title' });
      } catch (error) {
        twice = error.message;
      }
      items = c.list('options', (item, option, index) => {
        calls += 1;
        const pick = () => {
          picked.value = index;
        };
        const pressed = picked.value === index ? 'true' : nothing;
        const { id, text } = option;
        return html`<button type="button" data-pick=${id} aria-pressed=${pressed} @click=${pick}>${text}</button>`;
      });
    })(root);
    const children = [...root.children].map((el) => el.getAttribute('data-field') ?? el.className);
    root.querySelector('[data-pick="a2"]').click();
    await Promise.resolve();
    return {
      children,
      title: root.querySelector('[data-field="title"]').textContent,
      tail: root.querySelector('.tail').textContent,
      pressed: [...root.querySelectorAll('[data-pick]')].map((b) => b.getAttribute('aria-pressed')),
      items: items.length,
      calls,
      twice,
      update: typeof update,
    };
  });
  assert.deepEqual(
    out.children,
    ['title', 'intro', 'steps', 'options', 'quote', 'notes', 'picture', 'tail'],
    'the view comes after the authored fields',
  );
  assert.equal(out.title, 'A bold title!');
  assert.equal(out.tail, '1');
  assert.deepEqual(out.pressed, [null, 'true']);
  assert.equal(out.items, 2);
  assert.equal(out.calls, 4, 'each item once on setup and once on the change');
  assert.match(out.twice, /already has a view/);
  assert.equal(out.update, 'function');
});

test('mount: renders through the adapter, replace hides the authored HTML until dispose, '
  + 'unmount once after it', async () => {
  const page = await open();
  const out = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const root = document.querySelector('[data-component="all"]');
    const hiddenCount = () => [...root.children].filter((el) => el.hidden).length;
    const log = [];
    const adapter = {
      render(element, props) {
        element.textContent = `view ${props.n}`;
        log.push(['render', props.n]);
      },
      unmount(element) {
        log.push(['unmount', element.textContent]);
      },
    };
    let view;
    let ready = 0;
    const handle = defineBlock('all', (fields, c) => {
      view = c.mount(adapter, { n: 1 }, {
        replace: true,
        onReady: () => {
          ready += 1;
        },
      });
    })(root);
    const shown = [root.querySelector('[data-island]').textContent, hiddenCount()];
    view.update({ n: 2 });
    const updated = root.querySelector('[data-island]').textContent;
    handle.dispose();
    view.update({ n: 3 });
    const disposed = [root.querySelector('[data-island]'), hiddenCount()];
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { shown, updated, disposed, ready, log };
  });
  assert.deepEqual(out.shown, ['view 1', 7], 'the seven authored fields are hidden');
  assert.equal(out.updated, 'view 2');
  assert.deepEqual(out.disposed, [null, 0]);
  assert.equal(out.ready, 1);
  assert.deepEqual(
    out.log,
    [['render', 1], ['render', 2], ['unmount', 'view 2']],
    'no render after dispose; unmount once',
  );
});

test('mount: a first render or an update that throws or rejects rolls back, reports BLOCK_MOUNT_FAILED '
  + 'and unmounts what it allocated', async () => {
  const page = await open();
  const out = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const main = document.querySelector('main');
    const template = document.querySelector('[data-component="all"]');
    const log = [];
    const errors = [];
    // An adapter that allocates (records it) before it fails as `mode` says.
    const adapter = (name, mode) => ({
      render(element, props) {
        log.push([name, 'render', props.n]);
        const update = props.n === 2;
        if (mode === 'throw-first' || (mode === 'throw-update' && update)) throw new Error(`${name} threw`);
        if (mode === 'reject-first' || (mode === 'reject-update' && update)) {
          return Promise.reject(new Error(`${name} rejected`));
        }
        return undefined;
      },
      unmount() {
        log.push([name, 'unmount']);
      },
    });
    const results = {};
    for (const mode of ['throw-first', 'reject-first', 'throw-update', 'reject-update']) {
      const root = template.cloneNode(true);
      main.append(root);
      let view;
      defineBlock('all', (fields, c) => {
        view = c.mount(adapter(mode, mode), { n: 1 }, {
          replace: true,
          onError: (error) => errors.push(error.message),
        });
      })(root);
      await new Promise((resolve) => setTimeout(resolve, 0));
      view.update({ n: 2 });
      await new Promise((resolve) => setTimeout(resolve, 10));
      view.update({ n: 3 });
      results[mode] = [root.querySelector('[data-island]'), [...root.children].filter((el) => el.hidden).length];
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    const events = window.events
      .filter(([type]) => type === 'error')
      .map(([, d]) => [d.code, d.message, d.recoverable]);
    return { results, log, errors, events };
  });
  for (const mode of ['throw-first', 'reject-first', 'throw-update', 'reject-update']) {
    assert.deepEqual(out.results[mode], [null, 0], `${mode}: rolled back`);
  }
  assert.deepEqual(
    out.errors,
    ['throw-first threw', 'reject-first rejected', 'throw-update threw', 'reject-update rejected'],
  );
  assert.deepEqual(
    out.events.map(([code]) => code),
    ['BLOCK_MOUNT_FAILED', 'BLOCK_MOUNT_FAILED', 'BLOCK_MOUNT_FAILED', 'BLOCK_MOUNT_FAILED'],
  );
  assert.ok(out.events.every(([, , recoverable]) => recoverable === true));
  assert.deepEqual(out.log, [
    ['throw-first', 'render', 1],
    ['throw-first', 'unmount'],
    ['reject-first', 'render', 1],
    ['reject-first', 'unmount'],
    ['throw-update', 'render', 1],
    ['throw-update', 'render', 2],
    ['throw-update', 'unmount'],
    ['reject-update', 'render', 1],
    ['reject-update', 'render', 2],
    ['reject-update', 'unmount'],
  ], 'nothing renders after a failure; each adapter unmounts once');
});

test('mount: disposed while a render is pending, the adapter is unmounted once that render settles, '
  + 'never ready', async () => {
  const page = await open();
  const out = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const log = [];
    const runs = [];
    for (const outcome of ['resolve', 'reject']) {
      const root = document.querySelector('[data-component="all"]').cloneNode(true);
      document.querySelector('main').append(root);
      let finish;
      const adapter = {
        render() {
          log.push([outcome, 'render']);
          return new Promise((resolve, reject) => {
            finish = () => {
              log.push([outcome, 'allocated']);
              if (outcome === 'resolve') resolve();
              else reject(new Error('late'));
            };
          });
        },
        unmount() {
          log.push([outcome, 'unmount']);
        },
      };
      let ready = 0;
      const handle = defineBlock('all', (fields, c) => {
        c.mount(adapter, {}, {
          replace: true,
          onReady: () => {
            ready += 1;
          },
        });
      })(root);
      handle.dispose();
      await new Promise((resolve) => setTimeout(resolve, 10));
      log.push([outcome, 'disposed']);
      finish();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const hidden = [...root.children].filter((el) => el.hidden).length;
      runs.push([outcome, ready, root.querySelector('[data-island]'), hidden]);
    }
    const reported = window.events.filter(([type]) => type === 'error').length;
    return { log, runs, reported };
  });
  assert.deepEqual(out.log, [
    ['resolve', 'render'],
    ['resolve', 'disposed'],
    ['resolve', 'allocated'],
    ['resolve', 'unmount'],
    ['reject', 'render'],
    ['reject', 'disposed'],
    ['reject', 'allocated'],
    ['reject', 'unmount'],
  ], 'unmount waits for the pending render and runs once');
  assert.deepEqual(out.runs, [['resolve', 0, null, 0], ['reject', 0, null, 0]]);
  assert.equal(out.reported, 0, 'a render that settles after dispose reports nothing');
});

test('mount: dispose waits for every pending render (an earlier one settling last), '
  + 'and a throwing onError still unmounts', async () => {
  const page = await open();
  const out = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const log = [];
    const finish = {};
    const adapter = {
      render(element, props) {
        log.push(['render', props.n]);
        return new Promise((resolve) => {
          finish[props.n] = () => {
            log.push(['allocated', props.n]);
            resolve();
          };
        });
      },
      unmount() {
        log.push(['unmount']);
      },
    };
    const root = document.querySelector('[data-component="all"]').cloneNode(true);
    document.querySelector('main').append(root);
    let view;
    const handle = defineBlock('all', (fields, c) => {
      view = c.mount(adapter, { n: 1 }, {});
    })(root);
    view.update({ n: 2 });
    finish[2]();
    await new Promise((resolve) => setTimeout(resolve, 10));
    handle.dispose();
    await new Promise((resolve) => setTimeout(resolve, 10));
    log.push(['first still pending']);
    finish[1]();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const failing = [];
    const second = document.querySelector('[data-component="all"]').cloneNode(true);
    document.querySelector('main').append(second);
    const unhandled = [];
    const onUnhandled = (event) => {
      unhandled.push(String(event.reason?.message ?? event.reason));
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    let thrown = null;
    try {
      defineBlock('all', (fields, c) => {
        c.mount({
          render() {
            failing.push('render');
            throw new Error('render failed');
          },
          unmount() {
            failing.push('unmount');
          },
        }, {}, {
          onError() {
            throw new Error('onError threw');
          },
        });
      })(second);
    } catch (error) {
      thrown = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.removeEventListener('unhandledrejection', onUnhandled);
    return { log, failing, thrown, island: second.querySelector('[data-island]') };
  });
  assert.deepEqual(out.log, [
    ['render', 1],
    ['render', 2],
    ['allocated', 2],
    ['first still pending'],
    ['allocated', 1],
    ['unmount'],
  ], 'unmount waits for the first render too, and runs once');
  assert.deepEqual(out.failing, ['render', 'unmount'], 'the adapter is unmounted although onError threw');
  assert.equal(out.thrown, 'onError threw', 'the app\'s own error is not swallowed');
  assert.equal(out.island, null);
});

test('mount: a render that disposes the block while it runs (host.signal aborted) '
  + 'is still awaited before unmount', async () => {
  const page = await open();
  const log = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const entries = [];
    const controller = new AbortController();
    let finish;
    const adapter = {
      render() {
        entries.push('render');
        controller.abort();
        entries.push(document.querySelector('main [data-island]') ? 'island still shown' : 'island removed');
        return new Promise((resolve) => {
          finish = () => {
            entries.push('allocated');
            resolve();
          };
        });
      },
      unmount() {
        entries.push('unmount');
      },
    };
    const root = document.querySelector('[data-component="all"]').cloneNode(true);
    document.querySelector('main').append(root);
    defineBlock('all', (fields, c) => {
      c.mount(adapter, {}, {});
    })(root, { signal: controller.signal, keyOf: () => 'k' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    entries.push('waiting');
    finish();
    await new Promise((resolve) => setTimeout(resolve, 10));
    return entries;
  });
  assert.deepEqual(log, ['render', 'island removed', 'waiting', 'allocated', 'unmount']);
});

test('host.signal disposes the block; an aborted signal never runs setup; '
  + 'a cleanup and {dispose} returned by setup run on dispose', async () => {
  const page = await open();
  const out = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const [one, two] = document.querySelectorAll('[data-component="all"]');
    const log = [];
    const controller = new AbortController();
    defineBlock('all', (fields, c) => {
      c.signal.addEventListener('abort', () => log.push('ctx.signal'));
      return () => log.push('cleanup');
    })(one, { signal: controller.signal, keyOf: () => 'k' });
    controller.abort();
    const aborted = new AbortController();
    aborted.abort();
    defineBlock('all', () => {
      log.push('never');
    })(two, { signal: aborted.signal, keyOf: () => 'k' });
    const three = document.createElement('div');
    three.setAttribute('data-component', 'all');
    defineBlock('all', () => ({ dispose: () => log.push('object') }))(three).dispose();
    return log;
  });
  assert.deepEqual(out, ['ctx.signal', 'cleanup', 'object'], 'the block\'s signal aborts first, then its cleanups run');
});

test('a setup that throws disposes what it added and may run again; a rejected async setup too', async () => {
  const page = await open();
  const out = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const root = document.querySelector('[data-component="all"]');
    let runs = 0;
    const init = defineBlock('all', (fields, c) => {
      runs += 1;
      c.on(document, 'x-ping', () => {
        window.pinged = (window.pinged ?? 0) + 1;
      });
      if (runs === 1) throw new Error('first');
    });
    let thrown;
    try {
      init(root);
    } catch (error) {
      thrown = error.message;
    }
    document.dispatchEvent(new Event('x-ping'));
    init(root);
    document.dispatchEvent(new Event('x-ping'));
    let attempts = 0;
    const later = defineBlock('all', async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('async first');
    });
    const two = document.querySelectorAll('[data-component="all"]')[1];
    const rejected = await later(two).then(() => 'resolved', (error) => error.message);
    await later(two);
    return { thrown, runs, pinged: window.pinged, rejected, attempts };
  });
  assert.deepEqual(out, { thrown: 'first', runs: 2, pinged: 1, rejected: 'async first', attempts: 2 });
});

test('mount with real React 19 through the starters\' React view: renders, updates, '
  + 'and a render error after the first commit shows the authored HTML again', async () => {
  const view = await readFile(path.join(STARTERS, 'react/scripts/react-view.js'), 'utf8');
  const page = await open({ '/vendor/react.js': await reactBundle(), '/scripts/react-view.js': view });
  const result = await page.evaluate(async () => {
    const { defineBlock } = window.kit;
    const react = await import('/vendor/react.js');
    const { reactView } = await import('/scripts/react-view.js');
    const root = document.querySelector('[data-component="all"]');
    const Steps = ({ steps, explode }) => {
      if (explode) throw new Error('render failed');
      return react.createElement('ol', null, steps.map((step) => react.createElement('li', { key: step }, step)));
    };
    const errors = [];
    let handle;
    defineBlock('all', (fields, c) => {
      const onError = (error) => errors.push(error.message);
      handle = c.mount(reactView(react, Steps), fields, { replace: true, onError });
    })(root);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rendered = root.querySelector('[data-island]')?.innerHTML;
    const hidden = root.querySelector('[data-field="steps"]').hidden;
    handle.update({ steps: ['Changed'], explode: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const updated = root.querySelector('[data-island]')?.innerHTML;
    handle.update({ steps: [], explode: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const island = root.querySelector('[data-island]');
    const stillHidden = [...root.children].some((el) => el.hidden);
    return { rendered, hidden, updated, errors, island, stillHidden };
  });
  assert.deepEqual(result, {
    rendered: '<ol><li>One</li><li>Two code</li></ol>',
    hidden: true,
    updated: '<ol><li>Changed</li></ol>',
    errors: ['render failed'],
    island: null,
    stillHidden: false,
  });
  assert.deepEqual(page.errors, []);
});

// react + react-dom/client as one ES module (this workspace's dev dependencies), built once.
async function reactBundle() {
  const { build } = await import('vite');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'foliwake-react-bundle-'));
  try {
    const entry = path.join(dir, 'entry.js');
    const require = createRequire(import.meta.url);
    const react = JSON.stringify(require.resolve('react'));
    const client = JSON.stringify(require.resolve('react-dom/client'));
    await writeFile(entry, `export { createElement } from ${react};\nexport { createRoot } from ${client};\n`);
    const out = await build({
      root: ROOT,
      logLevel: 'silent',
      configFile: false,
      define: { 'process.env.NODE_ENV': '"production"' },
      build: { write: false, minify: false, lib: { entry, formats: ['es'], fileName: 'react' } },
    });
    return (Array.isArray(out) ? out[0] : out).output[0].code;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a block from `blocks new --js` on the dev page, through the import map and the starter loader '
  + 'with meta.ui; a block whose defineBlock names another folder', async () => {
  const { callout } = FIXTURE;
  const loader = await readFile(path.join(STARTERS, 'shared/scripts/components.js'), 'utf8');
  server.set('/_foliwake/block-kit.js', kit);
  server.set('/_foliwake/lit-html.js', lit);
  server.set('/scripts/components.js', loader);
  server.set('/styles/styles.css', '', 'text/css');
  server.set('/components/components.json', JSON.stringify(callout.descriptor), 'application/json');
  server.set('/components/callout/callout.js', callout.js);
  server.set('/components/callout/callout.css', callout.css, 'text/css');
  // A copy whose defineBlock names the callout: the loader refuses it.
  server.set('/components/other/other.js', callout.otherJs);
  const url = server.set('/', callout.page, 'text/html');
  const page = await newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(url);
  await page.waitForSelector('[data-component="callout"][data-component-status="ready"]');
  await page.waitForSelector('[data-component="other"][data-component-status="error"]');
  assert.equal(await page.getAttribute('p[data-component-error="other"]', 'data-component-error'), 'other');
  assert.match(await page.textContent('p[data-component-error="other"]'), /LOADER_BLOCK_NAME_MISMATCH/);
  assert.equal(
    await page.textContent('[data-component="callout"] button'),
    'Hide',
    'the label of callout.json ui, through components.json and meta',
  );
  await page.evaluate(() => document.addEventListener('block:toggle', (event) => (window.toggled = event.detail)));
  await page.click('[data-component="callout"] button');
  await page.waitForFunction(() => document.querySelector('[data-component="callout"] button').textContent === 'Show');
  const after = await page.evaluate(() => {
    const root = document.querySelector('[data-component="callout"]');
    return {
      detail: window.toggled,
      collapsed: root.hasAttribute('data-collapsed'),
      expanded: root.querySelector('button').getAttribute('aria-expanded'),
    };
  });
  assert.deepEqual(after, {
    detail: { key: '', block: 'callout', hidden: true, title: 'Hello' },
    collapsed: true,
    expanded: 'false',
  });
  assert.equal(await page.isVisible('[data-component="callout"] [data-field="text"]'), false);
  assert.ok(consoleErrors.some((text) => text.includes('LOADER_BLOCK_NAME_MISMATCH')), consoleErrors.join('\n'));
});

test('the specifier `@foliwake/block-kit` is the kit module; init declares contract 2', async () => {
  const page = await open();
  const result = await page.evaluate(async () => {
    const imported = await import('@foliwake/block-kit');
    const init = window.kit.defineBlock('probe', () => {});
    return { same: imported === window.kit, contract: init.contract, block: init.block, kit: window.kit.CONTRACT };
  });
  assert.deepEqual(result, { same: true, contract: 2, block: 'probe', kit: 2 });
});

test('the starter loader refuses a block that declares another contract major; '
  + 'one that declares none loads', async () => {
  const loader = await readFile(path.join(STARTERS, 'shared/scripts/components.js'), 'utf8');
  server.set('/scripts/components.js', loader);
  const script = { css: false, js: true };
  const descriptor = { htmlContract: 2, components: { old: script, plain: script } };
  server.set('/components/components.json', JSON.stringify(descriptor), 'application/json');
  const init = 'root.dataset.ran = "yes"; return { dispose() {} };';
  server.set('/components/old/old.js', `export default Object.assign((root) => { ${init} }, { contract: 1 });`);
  server.set('/components/plain/plain.js', `export default (root) => { ${init} };`);
  const roots = '<div data-component="old" class="old"></div><div data-component="plain" class="plain"></div>';
  const head = '<meta charset="utf-8"><title>T</title><script type="module" src="/scripts/components.js"></script>';
  const html = `<!doctype html><html lang="en" data-env="local" data-html-contract="2"><head>${head}</head>`
    + `<body><main>${roots}</main></body></html>`;
  const page = await newPage();
  await page.goto(server.set('/', html, 'text/html'));
  const attached = { state: 'attached' };
  await page.waitForSelector('[data-component="old"][data-component-status="error"]', attached);
  await page.waitForSelector('[data-component="plain"][data-component-status="ready"]', attached);
  assert.match(await page.textContent('p[data-component-error="old"]'), /LOADER_BLOCK_CONTRACT/);
  assert.equal(await page.getAttribute('[data-component="old"]', 'data-ran'), null, 'a refused block never runs');
  assert.equal(await page.getAttribute('[data-component="plain"]', 'data-ran'), 'yes');
});
