// @foliwake/react in a real browser (system Chrome through playwright-core): what React adds to
// @foliwake/client (re-renders do not remount and pass the latest props, StrictMode, the identity key, the
// stylesheet links it renders). The lifecycle itself (abort guards, static bodies, requireBlocks, dispose) is
// tested without React in client-browser.test.js.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { launchBrowser } from './helpers/browser.js';
import { parseFoliwakeConfig } from '@foliwake/server/config';
import { preparePage } from '@foliwake/server/page';
import { CDS, startBlocksServer } from './helpers/blocks-server.js';
import { configText } from './helpers/stub-origin.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let server;
let browser;
let dist;
let origin;
before(async () => {
  dist = await mkdtemp(path.join(os.tmpdir(), 'foliwake-react-harness-'));
  await build({ root: path.join(HERE, 'fixtures/react-harness'), logLevel: 'warn', plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] }, build: { outDir: dist, emptyOutDir: true, minify: false } });
  server = await startBlocksServer(dist);
  origin = server.origin;
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await server?.close();
  if (dist) await rm(dist, { recursive: true, force: true });
});

async function open(initial) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(origin);
  await page.evaluate((init) => window.harness.start(init), initial);
  return { page, errors, state: () => page.evaluate(() => ({ log: window.__log, events: window.__events, status: window.__status, errors: window.__errors, css: window.cssMounts(), links: [...document.head.querySelectorAll('link[data-code-release]')].map((l) => l.dataset.codeRelease) })) };
}
const ready = (page, n = 1) => page.waitForFunction((count) => document.querySelectorAll('button.fw').length === count, n);

describe('FoliwakePage in a browser', () => {
  test('mounts blocks, events reach onEvent with the latest host data and callback, no remount on re-render', async () => {
    const { page, errors, state } = await open({});
    await ready(page);
    assert.equal(await page.textContent('button.fw'), 'Check');
    await page.evaluate(() => window.harness.set({ saved: { k1: { selected: ['a'], correct: true } }, tag: 'v2', label: 'Проверить' }));
    await page.click('button.fw');
    const s = await state();
    assert.deepEqual(s.events, [['v2', 'answer', 'k1', { selected: ['a'], correct: true }]], 'latest onEvent and latest saved()');
    assert.deepEqual(s.log.filter(([k]) => k === 'mount').length, 1, 'a re-render with new host data does not remount');
    assert.deepEqual(s.status.map(([, x]) => x), ['mounting', 'ready']);
    assert.deepEqual(errors, []);
    await page.close();
  });

  test('StrictMode: the second mount starts from the pristine body (one button, not two)', async () => {
    const { page, state } = await open({ strict: true });
    await page.waitForFunction(() => window.__log.filter(([k]) => k === 'mount').length >= 1);
    await ready(page);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('button.fw').count(), 1);
    const s = await state();
    for (const [kind, , buttons] of s.log.filter(([k]) => k === 'mount')) assert.equal(buttons, 0, `${kind} on a pristine body`);
    assert.deepEqual(s.css, { [CDS.a]: 1 }, 'CSS count back to one mount after the StrictMode cycle');
    await page.close();
  });

  test('a new identity disposes and remounts; no event after dispose reaches onEvent', async () => {
    const { page, state } = await open({});
    await ready(page);
    const stale = await page.$('button.fw');
    await page.evaluate(() => window.harness.set({ embeds: ['oneNewEtag'] }));
    await page.waitForFunction(() => window.__log.filter(([k]) => k === 'mount').length === 2);
    await stale.evaluate((b) => b.click()).catch(() => {}); // detached old button: its event must go nowhere
    const s = await state();
    assert.deepEqual(s.log.map(([k]) => k), ['mount', 'dispose', 'mount']);
    assert.deepEqual(s.events, []);
    await page.close();
  });

  test('identity from preparePage: the same prepared page never remounts; a changed transform (body digest) disposes and remounts on the new body', async () => {
    const config = parseFoliwakeConfig(configText({ live: 'http://127.0.0.1:9' }));
    const envelope = { site: 'demo', channel: 'live', path: '/lessons/one', html: '<h2>one</h2><div data-component="quiz"><p>Q one</p></div>', codeRelease: CDS.a, htmlContract: '2', lang: 'en', pageId: null, etag: null, generation: null };
    const a = preparePage(config, envelope);
    const again = preparePage(config, envelope); // a fresh object, as after a server re-render
    const b = preparePage(config, envelope, { transform: (html) => html.replace('<h2>one</h2>', '<h2>one, rewritten</h2>') });
    assert.equal(again.identity, a.identity);
    assert.notEqual(b.identity, a.identity);
    assert.equal(a.blocksUrl, `/foliwake-code/${CDS.a}/scripts/blocks.js`);
    const { page, state } = await open({ embeds: [] });
    await page.evaluate((pages) => { window.harness.addPages(pages); window.harness.set({ embeds: ['prepA'] }); }, { prepA: a, prepAgain: again, prepB: b });
    await ready(page);
    await page.evaluate(() => window.harness.set({ embeds: ['prepAgain'] }));
    await page.waitForTimeout(200);
    assert.deepEqual((await state()).log.map(([k]) => k), ['mount'], 'same identity: no remount');
    await page.evaluate(() => window.harness.set({ embeds: ['prepB'] }));
    await page.waitForFunction(() => window.__log.filter(([k]) => k === 'mount').length === 2);
    await ready(page);
    assert.deepEqual((await state()).log.map(([k]) => k), ['mount', 'dispose', 'mount']);
    assert.equal(await page.textContent('[data-foliwake-body] h2'), 'one, rewritten');
    assert.equal(await page.locator('button.fw').count(), 1, 'the blocks mounted on the new body');
    await page.close();
  });

  test('CSS ownership: links of a release stay while any embed of it is mounted, then go', async () => {
    const { page, state } = await open({ embeds: ['one', 'two'] });
    await ready(page, 2);
    assert.deepEqual((await state()).css, { [CDS.a]: 2 });
    await page.evaluate(() => window.harness.set({ embeds: ['one'] }));
    await page.waitForTimeout(100);
    let s = await state();
    assert.deepEqual(s.css, { [CDS.a]: 1 });
    assert.ok(s.links.includes(CDS.a));
    await page.evaluate(() => window.harness.set({ embeds: ['other'] }));
    await ready(page, 1);
    await page.waitForFunction((cd) => !document.querySelector(`head link[data-code-release="${cd}"]`), CDS.a);
    s = await state();
    assert.deepEqual(s.css, { [CDS.b]: 1 });
    assert.ok(!s.links.includes(CDS.a) && s.links.includes(CDS.b));
    await page.close();
  });
});
