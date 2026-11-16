// @foliwake/server/preload: modulepreload / preload hints for a page with a question and a dsl block.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { parseFoliwakeConfig } from '@foliwake/server/config';
import { createOriginClient } from '@foliwake/server/origin';
import { preparePage, readEnvelope } from '@foliwake/server/page';
import { clearPreloadCache, preloadHints, staticImports } from '@foliwake/server/preload';
import { CD, configText, startStubOrigin } from './helpers/stub-origin.js';

const js = (body) => ({ headers: { 'content-type': 'text/javascript' }, body });
const BODY = '<h2>Q</h2><div data-component="question"><p>?</p></div><div data-component="dsl"><p>scene</p></div><div data-component="note"><p>n</p></div>';
let stub;
let config;
let client;
before(async () => {
  stub = await startStubOrigin({
    '/lessons/a.plain.html': { headers: { 'content-type': 'text/html', 'x-code-release': CD, 'x-html-contract': '2', etag: '"e"' }, body: BODY },
    [`/code/${CD}/components/components.json`]: { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ htmlContract: 2, components: { question: { js: true, css: true }, dsl: { js: true, css: true }, note: { js: false, css: true }, tap: { js: true, css: true } } }) },
    [`/code/${CD}/scripts/blocks.js`]: js(`import{emit as e}from"./block-kit.js";import { BLOCKS_CONTRACT } from './host.js';export{x}from"./host.js";const later=()=>import("./lazy.js");`),
    [`/code/${CD}/scripts/block-kit.js`]: js('export const emit=1;'),
    [`/code/${CD}/scripts/host.js`]: js('import"./block-kit.js";export const BLOCKS_CONTRACT={};'),
    [`/code/${CD}/components/question/question.js`]: js(`import{defineBlock,html}from"foliwake";import x from"lodash";export default defineBlock("question",()=>{})`),
    [`/code/${CD}/components/dsl/dsl.js`]: js(`import{j as t}from"../../scripts/react-vendor-1a2b.js";import"https://evil.example/x.js";import"../../../outside.js";export default 1`),
    [`/code/${CD}/scripts/react-vendor-1a2b.js`]: js('export const j=1;'),
    [`/code/${CD}/_foliwake/block-kit.js`]: js('import{html}from"./lit-html.js";export const defineBlock=1;'),
    [`/code/${CD}/_foliwake/lit-html.js`]: js('export const html=1;'),
  });
  config = parseFoliwakeConfig(configText({ live: stub.origin, preview: stub.origin }));
  client = createOriginClient(config, { DEMO_LIVE_PASSWORD: 'l', DEMO_PREVIEW_PASSWORD: 'p' });
});
after(() => stub?.close());
beforeEach(() => clearPreloadCache());

const pageOf = async (channel = 'live') => preparePage(config, await readEnvelope(config, client, 'demo', channel, '/lessons/a'));

test('static imports: minified and spaced forms, not dynamic import()', () => {
  assert.deepEqual(staticImports(`import{a}from"./a.js";import b from '../b.js';import"./c.js";export*from"./d.js";import('./lazy.js');const s="x";`), ['./a.js', '../b.js', './c.js', './d.js']);
  assert.deepEqual(staticImports(`import { defineBlock } from 'foliwake';import x from "lodash";import y from "foliwake-ui";`), ['foliwake'], 'the bare kit specifier, no other bare one');
});

test('question + dsl: entry, its imports, the blocks on the page, block-kit (bare `foliwake`) with its lit-html, the React chunk, and their CSS', async () => {
  const hints = await preloadHints(config, client, await pageOf());
  const base = `/foliwake-code/${CD}/`;
  assert.deepEqual(hints.filter((h) => h.rel === 'modulepreload').map((h) => h.href.slice(base.length)).sort(), [
    '_foliwake/block-kit.js',
    '_foliwake/lit-html.js',
    'components/dsl/dsl.js',
    'components/question/question.js',
    'scripts/block-kit.js',
    'scripts/blocks.js',
    'scripts/host.js',
    'scripts/react-vendor-1a2b.js',
  ]);
  assert.deepEqual(hints.filter((h) => h.rel === 'preload').map((h) => [h.as, h.href.slice(base.length)]).sort(), [
    ['style', 'components/dsl/dsl.css'], ['style', 'components/note/note.css'], ['style', 'components/question/question.css'],
  ]);
  assert.ok(hints.every((h) => h.href.startsWith(base)), 'same-origin proxy URLs only');
  assert.ok(!hints.some((h) => /tap|lazy|evil|outside/.test(h.href)), 'absent blocks, dynamic imports and foreign URLs are not hinted');
});

test('the code release is read once (immutable), preview through its own prefix', async () => {
  await preloadHints(config, client, await pageOf());
  const reads = stub.requests.filter((r) => r.path.startsWith('/code/')).length;
  await preloadHints(config, client, await pageOf());
  assert.equal(stub.requests.filter((r) => r.path.startsWith('/code/')).length, reads);
  const preview = await preloadHints(config, client, await pageOf('preview'));
  assert.ok(preview.every((h) => h.href.startsWith(`/foliwake-code/preview/${CD}/`)));
});

test('no code release, or an unreadable descriptor: fewer hints, never an error', async () => {
  const page = await pageOf();
  assert.deepEqual(await preloadHints(config, client, { ...page, codeBase: null, codeRelease: null, blocksUrl: null }), []);
  const broken = createOriginClient(config, { DEMO_LIVE_PASSWORD: 'l' }, { fetch: async () => { throw new Error('down'); } });
  assert.deepEqual(await preloadHints(config, broken, page), [{ rel: 'modulepreload', href: `/foliwake-code/${CD}/scripts/blocks.js` }]);
});
