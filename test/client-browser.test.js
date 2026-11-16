// @foliwake/client in a real browser (system Chrome through playwright-core), without any framework: the
// lifecycle invariants of docs/plan/react-packages.md §6.2 that every adapter inherits, against blocks modules
// served like a code proxy. The harness bundle is built by Vite with no plugin and must contain no React.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { build } from 'vite';
import { launchBrowser } from './helpers/browser.js';
import { CDS, startBlocksServer } from './helpers/blocks-server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let server;
let browser;
let dist;
before(async () => {
  dist = await mkdtemp(path.join(os.tmpdir(), 'foliwake-client-harness-'));
  await build({ root: path.join(HERE, 'fixtures/client-harness'), logLevel: 'warn', build: { outDir: dist, emptyOutDir: true, minify: false } });
  server = await startBlocksServer(dist);
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await server?.close();
  if (dist) await rm(dist, { recursive: true, force: true });
});

async function open() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(server.origin);
  const h = (method, ...args) => page.evaluate(([m, a]) => window.harness[m](...a), [method, args]);
  const state = () => page.evaluate(() => ({ log: window.__log, events: window.__events, status: window.__status, errors: window.__errors, css: window.cssMounts(), links: [...document.head.querySelectorAll('link[data-code-release]')].map((l) => l.dataset.codeRelease) }));
  return { page, errors, h, state };
}
const buttons = (page, n) => page.waitForFunction((count) => document.querySelectorAll('button.fw').length === count, n);
const mounts = (s) => s.log.filter(([k]) => k === 'mount');

/** The import map of a release: the kit under its specifier and, for one more minor, under `foliwake`. */
function kitMap(cd) {
  const kit = `/foliwake-code/${cd}/_foliwake/block-kit.js`;
  return { '@foliwake/block-kit': kit, foliwake: kit };
}

describe('@foliwake/client without a framework', () => {
  test('the harness bundle has no framework in it', async () => {
    const assets = path.join(dist, 'assets');
    const code = (await Promise.all((await readdir(assets)).filter((f) => f.endsWith('.js')).map((f) => readFile(path.join(assets, f), 'utf8')))).join('\n');
    assert.match(code, /mountFoliwakePage|data-foliwake-body/);
    assert.doesNotMatch(code, /Symbol\.for\(["']react\.|react-dom|from ["'](react|vue|svelte)["']/);
  });

  test('mounts into an empty element: inserts the body, default shell, events with the latest host data and callback after update()', async () => {
    const { page, errors, h, state } = await open();
    await h('mount', 'm', 'one');
    await buttons(page, 1);
    assert.equal(await page.textContent('#m h2'), 'one', 'the body was inserted');
    assert.equal(await page.getAttribute('#m', 'data-foliwake-body'), '');
    assert.equal(await page.getAttribute('#m', 'data-html-contract'), '2');
    assert.equal(await page.textContent('button.fw'), 'Check');
    await h('update', 'm', { saved: { k1: { selected: ['a'], correct: true } }, tag: 'v2', label: 'Проверить' });
    await page.click('button.fw');
    const s = await state();
    assert.deepEqual(s.events, [['v2', 'answer', 'k1', { selected: ['a'], correct: true }]], 'latest onEvent and latest saved()');
    assert.equal(mounts(s).length, 1, 'update() without a new identity does not remount');
    assert.equal(mounts(s)[0][4], 'harness');
    assert.equal(mounts(s)[0][5], CDS.a, 'the module\'s `foliwake` is its own release\'s kit (the import map the client added)');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('script[type="importmap"]')].map((m) => [m.dataset.foliwakeCode, JSON.parse(m.textContent)])), [
      [`/foliwake-code/${CDS.a}/`, { scopes: { [`/foliwake-code/${CDS.a}/`]: kitMap(CDS.a) } }],
    ]);
    assert.deepEqual(s.status.map(([, x]) => x), ['mounting', 'ready']);
    assert.equal(await h('status', 'm'), 'ready');
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('only the core event types reach onEvent unless the app names more in `events`', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one', { coreOnly: true });
    await buttons(page, 1);
    await page.click('button.fw');
    await page.evaluate(() => document.querySelector('#m [data-component]').dispatchEvent(new CustomEvent('demo:error', { bubbles: true, detail: { key: 'k1', block: 'quiz', code: 'X', message: 'x', recoverable: true } })));
    assert.deepEqual((await state()).events, [['v1', 'error', 'k1', null]], 'demo:answer is not delivered; demo:error is');
    await page.close();
  });

  test('the CSP nonce of the mount is set on the import map it adds', async () => {
    const { page, h } = await open();
    await h('mount', 'm', 'one', { nonce: 'n0nce-abcdefghijklmnop' });
    await buttons(page, 1);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('script[type="importmap"]')].map((m) => m.nonce)), ['n0nce-abcdefghijklmnop']);
    await page.close();
  });

  test('two code releases in one document: each module resolves `foliwake` to its own release (scoped maps, one per release)', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm1', 'one');
    await page.waitForFunction(() => window.__log.filter(([k]) => k === 'mount').length === 1);
    await h('mount', 'm2', 'other');
    await h('mount', 'm3', 'two');
    await page.waitForFunction(() => window.__log.filter(([k]) => k === 'mount').length === 3);
    const s = await state();
    assert.deepEqual(mounts(s).map(([, cd, , , , kit]) => [cd, kit]).sort(), [[CDS.a, CDS.a], [CDS.a, CDS.a], [CDS.b, CDS.b]].sort());
    assert.equal(await page.locator('script[type="importmap"]').count(), 2, 'one map per release, not per mount');
    await page.close();
  });

  test('update() of `events` changes what reaches onEvent: added types start, removed ones stop', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one', { coreOnly: true });
    await buttons(page, 1);
    await page.click('button.fw');
    await h('update', 'm', {});
    await page.click('button.fw');
    await h('update', 'm', {});
    await page.click('button.fw');
    await h('update', 'm', { coreOnly: true });
    await page.click('button.fw');
    const s = await state();
    assert.deepEqual(s.events.map(([, type]) => type), ['answer', 'answer'], 'delivered only while named, once per event (an equal list keeps the listeners)');
    assert.equal(mounts(s).length, 1, 'no remount');
    await page.close();
  });

  test('keeps server-rendered HTML on the first mount; mount → dispose → mount restores the pristine body', async () => {
    const { page, h, state } = await open();
    await page.evaluate(() => window.harness.serverRendered('ssr', 'one'));
    await page.evaluate(() => { document.querySelector('#ssr h2').dataset.marker = 'server'; });
    await h('mount', 'ssr', 'one');
    await buttons(page, 1);
    assert.equal(await page.getAttribute('#ssr h2', 'data-marker'), 'server', 'the first mount kept the server HTML');
    await h('dispose', 'ssr');
    assert.equal(await page.locator('button.fw').count(), 1, 'dispose leaves the DOM as it is');
    await h('mount', 'ssr', 'one');
    await page.waitForFunction(() => window.__log.filter(([k]) => k === 'mount').length === 2);
    await buttons(page, 1);
    const s = await state();
    for (const [, , before] of mounts(s)) assert.equal(before, 0, 'each mount on a pristine body');
    assert.equal(await page.getAttribute('#ssr h2', 'data-marker'), null, 'the second mount restored page.html');
    assert.deepEqual(s.css, { [CDS.a]: 1 });
    await page.close();
  });

  test('dispose is idempotent; no event or status after it; status reads disposed', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one');
    await buttons(page, 1);
    await h('dispose', 'm');
    await h('dispose', 'm');
    await page.click('button.fw');
    const s = await state();
    assert.deepEqual(s.log.map(([k]) => k), ['mount', 'dispose'], 'handle.dispose() once');
    assert.deepEqual(s.events, []);
    assert.deepEqual(s.css, {});
    assert.ok(!s.links.includes(CDS.a), 'the last mount of the release removed its links');
    assert.equal(await h('status', 'm'), 'disposed');
    await page.close();
  });

  test('update({ page }) with a new identity disposes and remounts on the pristine body; the old blocks deliver nothing', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one');
    await buttons(page, 1);
    const stale = await page.$('button.fw');
    await h('update', 'm', { page: 'oneNewEtag' });
    await page.waitForFunction(() => window.__log.filter(([k]) => k === 'mount').length === 2);
    await buttons(page, 1);
    await stale.evaluate((b) => b.click()).catch(() => {});
    const s = await state();
    assert.deepEqual(s.log.map(([k]) => k), ['mount', 'dispose', 'mount']);
    assert.equal(mounts(s)[1][2], 0, 'pristine body');
    assert.deepEqual(s.events, []);
    await page.close();
  });

  test('identity is the remount key: same identity → no remount; a changed body digest → dispose + remount on the new body', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'oneDigestA');
    await buttons(page, 1);
    await h('update', 'm', { page: 'oneDigestAAgain', tag: 'v2' });
    await page.waitForTimeout(100);
    let s = await state();
    assert.deepEqual(s.log.map(([k]) => k), ['mount'], 'same identity: no dispose, no remount');
    await h('update', 'm', { page: 'oneDigestB' });
    await page.waitForFunction(() => window.__log.filter(([k]) => k === 'mount').length === 2);
    await buttons(page, 1);
    s = await state();
    assert.deepEqual(s.log.map(([k]) => k), ['mount', 'dispose', 'mount']);
    assert.equal(mounts(s)[1][2], 0, 'mounted on the pristine new body');
    assert.equal(await page.textContent('#m h2'), 'one, rewritten', 'the new final body is in the element');
    await page.close();
  });

  test('lifecycle hooks: phase order, site before template (awaited), beforeBlocks before mountBlocks; a failing hook is reported and the mount goes on', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one', { hooks: 'failing' });
    await page.waitForFunction(() => window.__hooks.length === 8);
    const hooks = await page.evaluate(() => window.__hooks);
    assert.deepEqual(hooks.map(([level, phase]) => `${level}:${phase}`), [
      'site:beforeBlocks', 'template:beforeBlocks', 'site:afterFirstSection', 'template:afterFirstSection',
      'site:lazy', 'template:lazy', 'site:delayed', 'template:delayed',
    ]);
    assert.deepEqual(hooks.slice(0, 2).map(([, , b]) => b), [0, 0], 'beforeBlocks runs before mountBlocks');
    assert.deepEqual(hooks.slice(2).map(([, , b]) => b), [1, 1, 1, 1, 1, 1], 'later phases see the mounted blocks');
    const s = await state();
    assert.deepEqual(s.errors, [['one', 'HOOK_FAILED']]);
    assert.deepEqual(s.status.map(([, x]) => x), ['mounting', 'ready']);
    await page.close();
  });

  test('lifecycle hooks: nothing runs after dispose', async () => {
    const { page, h } = await open();
    await h('mount', 'm', 'slow', { hooks: true });
    await page.waitForTimeout(100);
    await h('dispose', 'm');
    await page.waitForTimeout(2000);
    assert.deepEqual(await page.evaluate(() => window.__hooks), []);
    await page.close();
  });

  test('lifecycle hooks: dispose during a running hook returns at once; the hook sees the abort, nothing else runs; the element mounts again at once', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one', { hooks: 'slow' });
    await page.waitForFunction(() => window.__status.some(([, s]) => s === 'mounting'));
    await page.waitForTimeout(300); // the module loaded; the site beforeBlocks hook is running
    const started = Date.now();
    await h('dispose', 'm');
    await h('mount', 'm', 'one'); // the same element, right away
    await buttons(page, 1);
    assert.ok(Date.now() - started < 900, 'neither dispose nor the next mount waited for the slow hook');
    await page.waitForFunction(() => window.__hooks.length >= 1);
    await page.waitForTimeout(300);
    const hooks = await page.evaluate(() => window.__hooks);
    assert.deepEqual(hooks, [['site', 'beforeBlocks', 'resumed', true]], 'the hook resumed with signal.aborted; no template hook ran');
    const s = await state();
    assert.equal(mounts(s).length, 1, 'mountBlocks ran only for the second mount');
    assert.equal(mounts(s)[0][2], 0, 'on the pristine body');
    assert.deepEqual(s.status.map(([, x]) => x), ['mounting', 'mounting', 'ready']);
    await page.close();
  });

  test('cancellation from page code: an abort from a custom element connectedCallback during the body insertion takes nothing (stylesheets: true)', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'probe', { abortOnConnect: true, stylesheets: true });
    assert.equal(await page.evaluate(() => window.__connected), 1, 'the probe ran during the insertion');
    assert.equal(await h('status', 'm'), 'disposed');
    await page.waitForTimeout(500);
    const s = await state();
    assert.deepEqual(s.css, {}, 'no CSS count');
    assert.deepEqual(s.links, [], 'no stylesheet link');
    assert.deepEqual(mounts(s), [], 'no blocks');
    assert.deepEqual(s.status, [], 'no callback after the abort');
    await page.close();
  });

  test('cancellation from a custom-element container: an abort in attributeChangedCallback stops before the next attribute write', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one', { tag: 'attr-probe', abortOnAttr: true, stylesheets: true });
    assert.equal(await h('status', 'm'), 'disposed');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => window.__attrs), ['data-foliwake-body'], 'data-html-contract was not written after the dispose');
    assert.equal(await page.evaluate(() => document.getElementById('m').hasAttribute('data-html-contract')), false);
    const s = await state();
    assert.deepEqual(s.css, {});
    assert.deepEqual(s.links, []);
    assert.deepEqual(s.status, []);
    assert.deepEqual(mounts(s), []);
    await page.close();
  });

  for (const loader of ['abortThrow', 'abortReject']) {
    test(`cancellation from a custom loader (${loader}): no unhandled rejection, nothing reported after the dispose`, async () => {
      const { page, h, state, errors } = await open();
      await h('mount', 'm', 'one', { loader });
      assert.equal(await h('status', 'm'), 'disposed');
      await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(() => window.__unhandled), []);
      const s = await state();
      assert.deepEqual(s.errors, [], 'no onError after the dispose');
      assert.deepEqual(s.status.map(([, x]) => x), ['mounting']);
      assert.deepEqual(mounts(s), []);
      assert.deepEqual(errors, []);
      await page.close();
    });
  }

  test('cancellation from the first callback: an external abort in onStatus("mounting") stops the mount and releases what it took', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one', { abortOnMounting: true, stylesheets: true });
    assert.equal(await h('status', 'm'), 'disposed');
    await page.waitForTimeout(500);
    const s = await state();
    assert.deepEqual(mounts(s), [], 'the blocks module never mounted');
    assert.deepEqual(s.status.map(([, x]) => x), ['mounting']);
    assert.deepEqual(s.css, {});
    assert.deepEqual(s.links, [], 'the links taken before the abort were removed with the CSS count');
    await page.close();
  });

  test('dispose during mountBlocks (from onEvent on a synchronous block event): the returned handle is disposed, onMount never runs', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'sync', { disposeOnEvent: true });
    await page.waitForFunction(() => window.__log.some(([k]) => k === 'dispose'));
    await page.waitForTimeout(200);
    const s = await state();
    assert.deepEqual(s.log.map(([k]) => k), ['mount', 'dispose']);
    assert.deepEqual(s.events.map(([, type]) => type), ['ready']);
    assert.deepEqual(await page.evaluate(() => window.__onMount), []);
    assert.equal(await h('status', 'm'), 'disposed');
    assert.deepEqual(s.css, {});
    await page.close();
  });

  test('re-entrancy: dispose() from inside the disposal of an update starts nothing on the disposed mount', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one', { reenter: 'dispose' });
    await buttons(page, 1);
    await h('update', 'm', { page: 'two' });
    assert.equal(await h('status', 'm'), 'disposed');
    await page.waitForTimeout(500);
    const s = await state();
    assert.deepEqual(s.log.map(([k, cd]) => `${k} ${cd}`), [`mount ${CDS.a}`, `dispose ${CDS.a}`], 'no session for "two"');
    assert.deepEqual(s.css, {});
    await page.close();
  });

  test('re-entrancy: update(C) from inside the disposal of update(B) starts C once and never B', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm', 'one', { reenter: 'other' });
    await buttons(page, 1);
    await h('update', 'm', { page: 'two' });
    await page.waitForFunction(() => window.__log.filter(([k]) => k === 'mount').length >= 2);
    await page.waitForTimeout(500);
    const s = await state();
    assert.deepEqual(s.log.map(([k, cd]) => `${k} ${cd}`), [`mount ${CDS.a}`, `dispose ${CDS.a}`, `mount ${CDS.b}`]);
    assert.equal(await page.evaluate(() => document.querySelector('#m h2').textContent), 'other');
    assert.equal(await page.locator('#m button.fw').count(), 1);
    assert.deepEqual(s.css, { [CDS.b]: 1 }, 'no orphaned session holds CSS');
    await h('dispose', 'm');
    assert.deepEqual((await state()).log.map(([k]) => k).slice(-1), ['dispose'], 'the live session (C) is the one disposed');
    await page.close();
  });

  test('abort guards: dispose, or the external signal, while the module loads never mounts', async () => {
    const { page, h, state } = await open();
    await h('mount', 'a', 'slow');
    await h('mount', 'b', 'slow', { signal: true });
    await page.waitForTimeout(100);
    await h('dispose', 'a');
    await h('abort', 'b');
    assert.equal(await h('status', 'b'), 'disposed');
    await page.waitForTimeout(2000); // the slow module resolves meanwhile
    const s = await state();
    assert.ok(!mounts(s).some(([, cd]) => cd === CDS.slow), JSON.stringify(s.log));
    assert.deepEqual(s.status.map(([, x]) => x), ['mounting', 'mounting']);
    assert.deepEqual(s.css, {});
    await page.close();
  });

  test('contract major mismatch and plain/1 bodies stay static with an error code; requireBlocks makes it error', async () => {
    const { page, h, state } = await open();
    await h('mount', 'major3', 'major3');
    await h('mount', 'p1', 'plain1');
    await h('mount', 'req', 'plain1', { requireBlocks: true });
    await page.waitForFunction(() => window.__errors.length >= 3);
    const s = await state();
    assert.deepEqual(s.errors.sort(), [['major3', 'BLOCKS_CONTRACT_UNSUPPORTED'], ['plain1', 'NO_CODE_RELEASE'], ['plain1', 'NO_CODE_RELEASE']]);
    assert.deepEqual(s.status.filter(([, x]) => x !== 'mounting').map(([n, x]) => `${n} ${x}`).sort(), ['major3 static', 'plain1 error', 'plain1 static']);
    assert.equal(await page.locator('button.fw').count(), 0);
    assert.equal(await page.locator('[data-foliwake-body] h2').count(), 3, 'the authored body is shown');
    await page.close();
  });

  test('CSS ownership: the stylesheets option adds links counted per release; they go with the last mount', async () => {
    const { page, h, state } = await open();
    await h('mount', 'm1', 'one', { stylesheets: true });
    await h('mount', 'm2', 'two', { stylesheets: true });
    await buttons(page, 2);
    let s = await state();
    assert.deepEqual(s.css, { [CDS.a]: 2 });
    assert.equal(await page.locator(`head link[data-component-css="quiz"][data-code-release="${CDS.a}"]`).count(), 1, 'one link per block and release, shared');
    await h('dispose', 'm1');
    s = await state();
    assert.deepEqual(s.css, { [CDS.a]: 1 });
    assert.ok(s.links.includes(CDS.a));
    await h('mount', 'm3', 'other', { stylesheets: true });
    await h('dispose', 'm2');
    await buttons(page, 3);
    s = await state();
    assert.deepEqual(s.css, { [CDS.b]: 1 });
    assert.ok(!s.links.includes(CDS.a) && s.links.includes(CDS.b));
    await page.close();
  });

  test('subscribeBlockEvents routes events by type until unsubscribed', async () => {
    const { page, h } = await open();
    await h('mount', 'm', 'one');
    await buttons(page, 1);
    await page.evaluate(() => { window.__stop = window.harness.subscribe('m'); });
    await page.click('button.fw');
    await page.evaluate(() => window.__stop());
    await page.click('button.fw');
    assert.deepEqual(await page.evaluate(() => window.__subscribed), ['k1']);
    assert.equal(await h('subscribeCycles', 'm', 20), 0, 'unsubscribing also removes the listener on the external signal');
    await page.close();
  });
});
