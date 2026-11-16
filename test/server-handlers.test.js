// @foliwake/server/handlers: code and media proxies with real Request/Response against a stub origin.
import assert from 'node:assert/strict';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import { parseFoliwakeConfig } from '@foliwake/server/config';
import { createOriginClient } from '@foliwake/server/origin';
import { codeHandler, mediaHandler } from '@foliwake/server/handlers';
import { CD, SHA, configText, startStubOrigin } from './helpers/stub-origin.js';

const SOURCE = `export const big = ${JSON.stringify('x'.repeat(20_000))};`;
const GZ = gzipSync(SOURCE);
const BR = brotliCompressSync('.q{color:red}'.repeat(500));
const IMG = Buffer.alloc(9000, 7);
const GZ_IMG = gzipSync(IMG);
let stub;
let config;
let client;
const env = { DEMO_LIVE_PASSWORD: 'lp', DEMO_PREVIEW_PASSWORD: 'pp' };
const js = (body = 'export {}') => ({ headers: { 'content-type': 'text/javascript; charset=utf-8', etag: '"c1"' }, body });
before(async () => {
  stub = await startStubOrigin({
    [`/code/${CD}/scripts/blocks.js`]: js(),
    [`/code/${CD}/components/q/q.css`]: { headers: { 'content-type': 'text/css' }, body: '.q{}' },
    [`/code/${CD}/styles/icon.svg`]: { headers: { 'content-type': 'image/svg+xml' }, body: '<svg/>' },
    [`/code/${CD}/scripts/lies.js`]: { headers: { 'content-type': 'text/html' }, body: '<script>' },
    [`/code/${CD}/scripts/error.js`]: { status: 500, headers: {} },
    [`/code/${CD}/scripts/big.js`]: (req, res) => {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      const chunk = Buffer.alloc(256 * 1024, 0x20);
      let sent = 0;
      const write = () => { while (sent < 6 * 1024 * 1024) { sent += chunk.length; if (!res.write(chunk)) return res.once('drain', write); } res.end(); };
      res.on('error', () => {}); write();
    },
    [`/code/local/scripts/blocks.js`]: js(),
    [`/code/${CD}/scripts/gz.js`]: { headers: { 'content-type': 'text/javascript', 'content-encoding': 'gzip', 'content-length': String(GZ.length), etag: '"gz"' }, body: GZ },
    [`/code/${CD}/components/q/br.css`]: { headers: { 'content-type': 'text/css', 'content-encoding': 'br', 'content-length': String(BR.length) }, body: BR },
    [`/media/${SHA}.webp`]: { headers: { 'content-type': 'image/webp', 'content-encoding': 'gzip', 'content-length': String(GZ_IMG.length) }, body: GZ_IMG },
    [`/media/${SHA}.png`]: { headers: { 'content-type': 'image/png' }, body: Buffer.from([0x89, 0x50]) },
    [`/media/${SHA}.svg`]: { headers: { 'content-type': 'image/svg+xml' }, body: '<svg/>' },
    [`/media/${SHA}.gif`]: { headers: { 'content-type': 'text/html' }, body: '<p>' },
  });
  config = parseFoliwakeConfig(configText({ live: stub.origin, preview: stub.origin }));
  client = createOriginClient(config, env);
});
after(() => stub?.close());

const get = (handler, path, init = {}) => handler(new Request(`https://app.example/x/${path.join('/')}`, { headers: { cookie: 'session=s', authorization: 'Bearer user' }, ...init }), { path });

describe('codeHandler', () => {
  test('requires an explicit authorizePreview', () => {
    assert.throws(() => codeHandler(config, client, {}), /authorizePreview/);
    assert.throws(() => codeHandler(config, client), /authorizePreview/);
  });

  test('live: immutable, typed, nosniff; browser headers never forwarded', async () => {
    const handler = codeHandler(config, client, { authorizePreview: false });
    const res = await get(handler, [CD, 'scripts', 'blocks.js']);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'export {}');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const sent = stub.requests.at(-1);
    assert.equal(sent.path, `/code/${CD}/scripts/blocks.js`);
    assert.equal(sent.headers.cookie, undefined);
    assert.equal(sent.headers.authorization, `Basic ${Buffer.from('app:lp').toString('base64')}`);
    assert.equal((await get(handler, [CD, 'components', 'q', 'q.css'])).headers.get('content-type'), 'text/css; charset=utf-8');
    const svg = await get(handler, [CD, 'styles', 'icon.svg']);
    assert.match(svg.headers.get('content-security-policy'), /sandbox/);
  });

  test('a compressed origin answer: the decoded body is sent without the encoded Content-Length or ETag', async () => {
    const handler = codeHandler(config, client, { authorizePreview: false });
    const gz = await get(handler, [CD, 'scripts', 'gz.js']);
    assert.equal(gz.status, 200);
    assert.equal(gz.headers.get('content-length'), null);
    assert.equal(gz.headers.get('content-encoding'), null);
    assert.equal(gz.headers.get('etag'), null);
    assert.equal(await gz.text(), SOURCE);
    const br = await get(handler, [CD, 'components', 'q', 'br.css']);
    assert.equal(br.headers.get('content-length'), null);
    assert.equal(await br.text(), '.q{color:red}'.repeat(500));
    const head = await get(handler, [CD, 'scripts', 'gz.js'], { method: 'HEAD' });
    assert.equal(head.headers.get('content-length'), null);
    const media = await get(mediaHandler(config, client, { authorizePreview: false }), [`${SHA}.webp`]);
    assert.equal(media.headers.get('content-length'), null);
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), IMG);
    const plain = await get(handler, [CD, 'scripts', 'blocks.js']);
    assert.equal(plain.headers.get('etag'), '"c1"', 'an unencoded answer keeps its ETag');
  });

  test('HEAD answers headers only', async () => {
    const res = await get(codeHandler(config, client, { authorizePreview: false }), [CD, 'scripts', 'blocks.js'], { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '');
    assert.equal(stub.requests.at(-1).method, 'HEAD');
  });

  test('path checks refuse before any origin request', async () => {
    const handler = codeHandler(config, client, { authorizePreview: false });
    const before = stub.requests.length;
    for (const path of [
      ['cd_short', 'scripts', 'a.js'], [CD.toUpperCase(), 'scripts', 'a.js'], [CD], [CD, 'content', 'a.js'], [CD, 'scripts', '..', 'a.js'],
      [CD, 'scripts', 'a.html'], [CD, 'scripts', 'a%2Fb.js'], [CD, 'scripts', 'a/b.js'], [CD, 'scripts', '.hidden.js'], [CD, 'scripts', 'a\\b.js'],
      [CD, 'scripts', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h.js'], ['local', 'scripts', 'blocks.js'].map((s, i) => (i === 0 ? 'locals' : s)),
    ]) {
      const res = await get(handler, path);
      assert.equal(res.status, 404, path.join('/'));
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
    assert.equal(stub.requests.length, before);
    assert.equal((await handler(new Request('https://app.example/x', { method: 'POST' }), { path: [CD, 'scripts', 'blocks.js'] })).status, 405);
  });

  test('origin answers: 404 → 404, other → 502, type mismatch → 502, all no-store', async () => {
    const handler = codeHandler(config, client, { authorizePreview: false });
    const missing = await get(handler, [CD, 'scripts', 'missing.js']);
    assert.equal(missing.status, 404);
    for (const name of ['error.js', 'lies.js']) {
      const res = await get(handler, [CD, 'scripts', name]);
      assert.equal(res.status, 502, name);
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
  });

  test('a body past 5 MB is cut (streamed counter, no Content-Length)', async () => {
    const res = await get(codeHandler(config, client, { authorizePreview: false }), [CD, 'scripts', 'big.js']);
    assert.equal(res.status, 200);
    await assert.rejects(res.arrayBuffer(), /larger than/);
  });

  test('local code release only from a loopback origin, never immutable', async () => {
    const res = await get(codeHandler(config, client, { authorizePreview: false }), ['local', 'scripts', 'blocks.js']);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const remote = parseFoliwakeConfig(configText({ live: 'https://live.example' }));
    const res2 = await get(codeHandler(remote, createOriginClient(remote, env, { fetch: () => assert.fail('no request') }), { authorizePreview: false }), ['local', 'scripts', 'blocks.js']);
    assert.equal(res2.status, 404);
  });

  test('preview: 404 without authorisation; authorised answers are private, no-store, with preview credentials', async () => {
    const path = ['preview', CD, 'scripts', 'blocks.js'];
    assert.equal((await get(codeHandler(config, client, { authorizePreview: false }), path)).status, 404);
    const seen = [];
    const denied = await get(codeHandler(config, client, { authorizePreview: (r) => { seen.push(r.headers.get('cookie')); return false; } }), path);
    assert.equal(denied.status, 404);
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(seen, ['session=s']);
    assert.equal((await get(codeHandler(config, client, { authorizePreview: () => { throw new Error('auth down'); } }), path)).status, 404);
    const ok = await get(codeHandler(config, client, { authorizePreview: async () => true }), path);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'private, no-store');
    assert.equal(stub.requests.at(-1).headers.authorization, `Basic ${Buffer.from('app:pp').toString('base64')}`);
    const miss = await get(codeHandler(config, client, { authorizePreview: () => true }), ['preview', CD, 'scripts', 'missing.js']);
    assert.equal(miss.headers.get('cache-control'), 'private, no-store');
  });
});

describe('mediaHandler', () => {
  test('one hashed image segment; live immutable, preview private', async () => {
    const handler = mediaHandler(config, client, { authorizePreview: () => true });
    const res = await get(handler, [`${SHA}.png`]);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const preview = await get(handler, ['preview', `${SHA}.png`]);
    assert.equal(preview.headers.get('cache-control'), 'private, no-store');
    assert.equal((await get(handler, [`${SHA}.gif`])).status, 502);
    // An SVG reference image (engine content-components.md §3.7): served sandboxed, like a code SVG.
    const svg = await get(handler, [`${SHA}.svg`]);
    assert.equal(svg.status, 200);
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
    assert.match(svg.headers.get('content-security-policy'), /sandbox/);
    const notMedia = [[`${SHA}.html`], ['x.png'], [`${SHA}.png`, 'x'], [`${SHA.slice(1)}.png`], []];
    for (const path of notMedia) assert.equal((await get(handler, path)).status, 404, path.join('/'));
    assert.equal((await get(mediaHandler(config, client, { authorizePreview: false }), ['preview', `${SHA}.png`])).status, 404);
  });
});
