// @foliwake/server/handler without any framework: plain `new Request(...)` in, Response out. Routing (code,
// media, hook, health, 404), preview off by default, FOLIWAKE_URL discovery read once, the hook's signature.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createFoliwakeHandler } from '@foliwake/server/handler';
import { signFoliwakeHook } from '@foliwake/server/hook';
import { CD, SHA, startStubOrigin } from './helpers/stub-origin.js';
import { discoveryDoc } from './fixtures/discovery.js';

const SECRET = 'h'.repeat(40);
const APP = 'https://app.example';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

let stub;
let discoveryReads = 0;
before(async () => {
  stub = await startStubOrigin({
    '/.well-known/foliwake.json': (req, res) => {
      discoveryReads += 1;
      const doc = discoveryDoc({ site: 'demo', live: { url: stub.origin }, preview: { url: stub.origin }, media: null });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(doc));
    },
    [`/code/${CD}/scripts/blocks.js`]: { headers: { 'content-type': 'text/javascript' }, body: 'export {};' },
    [`/media/${SHA}.png`]: { headers: { 'content-type': 'image/png' }, body: PNG },
  });
});
after(() => stub?.close());

const env = () => ({ FOLIWAKE_URL: stub.origin, FOLIWAKE_HOOK_SECRET: SECRET, FOLIWAKE_PREVIEW_TOKEN: 'pt' });
const get = (path, init) => new Request(`${APP}${path}`, init);
const log = { warn: () => {}, error: () => {} };

describe('routing', () => {
  const handler = () => createFoliwakeHandler({ env: env(), log });

  test('code and media under /foliwake/code and /foliwake/media (version 3 defaults)', async () => {
    const h = handler();
    const code = await h(get(`/foliwake/code/${CD}/scripts/blocks.js`));
    assert.equal(code.status, 200);
    assert.equal(code.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(code.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(await code.text(), 'export {};');
    const media = await h(get(`/foliwake/media/${SHA}.png`));
    assert.equal(media.status, 200);
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), PNG);
  });

  test('health: { ok, site }, no-store; HEAD has no body', async () => {
    const h = handler();
    const response = await h(get('/foliwake/health'));
    assert.deepEqual(await response.json(), { ok: true, site: 'demo' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await (await h(get('/foliwake/health', { method: 'HEAD' }))).text(), '');
    assert.equal((await h(get('/foliwake/health', { method: 'POST' }))).status, 405);
  });

  test('anything else is 404; nothing is forwarded', async () => {
    const h = handler();
    await h(get('/foliwake/health'));
    const before = stub.requests.length;
    for (const path of ['/foliwake', '/foliwake/other', '/foliwake/code/x/../../etc', '/elsewhere', '/foliwake/hook/x']) {
      assert.equal((await h(get(path))).status, 404, path);
    }
    assert.equal(stub.requests.length, before);
  });

  test('the discovery document is read once per handler', async () => {
    const reads = discoveryReads;
    const h = handler();
    await Promise.all([h(get('/foliwake/health')), h(get('/foliwake/health')), h(get('/foliwake/health'))]);
    assert.equal(discoveryReads, reads + 1);
  });
});

describe('preview', () => {
  test('off by default: 404, private, and the origin is not asked', async () => {
    const h = createFoliwakeHandler({ env: env(), log });
    const before = stub.requests.length;
    const response = await h(get(`/foliwake/code/preview/${CD}/scripts/blocks.js`));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.ok(stub.requests.slice(before).every((r) => !r.path.startsWith('/code/')));
  });

  test('with an author check: Basic preview + FOLIWAKE_PREVIEW_TOKEN, private', async () => {
    const authorizePreview = (request) => request.headers.get('cookie') === 'role=author';
    const h = createFoliwakeHandler({ env: env(), log, authorizePreview });
    const path = `/foliwake/code/preview/${CD}/scripts/blocks.js`;
    assert.equal((await h(get(path))).status, 404);
    const response = await h(get(path, { headers: { cookie: 'role=author' } }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const sent = stub.requests.at(-1);
    assert.equal(sent.headers.authorization, `Basic ${Buffer.from('preview:pt').toString('base64')}`);
    assert.equal(sent.headers.cookie, undefined, 'the browser cookie is not forwarded');
  });
});

describe('hook', () => {
  const ping = JSON.stringify({ version: 1, event: 'ping', site: 'demo', sentAt: new Date().toISOString() });
  const signed = (body, secret = SECRET) =>
    get('/foliwake/hook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'foliwake-signature': signFoliwakeHook(body, secret) },
      body,
    });

  test('a signed ping answers the site and the server package', async () => {
    const response = await createFoliwakeHandler({ env: env(), log })(signed(ping));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.site, 'demo');
    assert.match(body.sdk, /^@foliwake\/server\/\d+\.\d+\.\d+/);
  });

  test('a bad signature is 401; no secret is 500; hook: false is 404', async () => {
    assert.equal((await createFoliwakeHandler({ env: env(), log })(signed(ping, 'x'.repeat(40)))).status, 401);
    const noSecret = { ...env(), FOLIWAKE_HOOK_SECRET: undefined };
    assert.equal((await createFoliwakeHandler({ env: noSecret, log })(signed(ping))).status, 500);
    assert.equal((await createFoliwakeHandler({ env: env(), log, hook: false })(signed(ping))).status, 404);
  });

  test('a delivery calls onDelivery', async () => {
    const delivered = [];
    const onDelivery = (payload) => delivered.push(payload.pages);
    const body = JSON.stringify({
      version: 1,
      event: 'delivery.settled',
      site: 'demo',
      generation: 3,
      release: null,
      codeRelease: null,
      operation: { id: 'op_1', kind: 'content_publish' },
      pages: ['/a'],
      all: false,
      verified: true,
      sentAt: new Date().toISOString(),
    });
    const response = await createFoliwakeHandler({ env: env(), log, hook: { onDelivery } })(signed(body));
    assert.equal(response.status, 200);
    assert.deepEqual(delivered, [['/a']]);
  });

  test('an own endpoint replaces the default one', async () => {
    const endpoint = async () => new Response('own');
    const h = createFoliwakeHandler({ env: env(), log, hook: { endpoint } });
    assert.equal(await (await h(signed(ping))).text(), 'own');
  });
});

describe('config', () => {
  test('a given config is used as it is (no discovery)', async () => {
    const config = { site: 'given', app: { proxies: { code: '/c', media: '/m', pages: null } }, live: null, preview: null };
    const h = createFoliwakeHandler({ config, env: {}, log });
    assert.deepEqual(await (await h(get('/foliwake/health'))).json(), { ok: true, site: 'given' });
  });

  test('no FOLIWAKE_URL and no file: 503, tried again on the next request', async () => {
    let calls = 0;
    const config = () => {
      calls += 1;
      throw new Error('not configured');
    };
    const h = createFoliwakeHandler({ config, log });
    assert.equal((await h(get('/foliwake/health'))).status, 503);
    assert.equal((await h(get('/foliwake/health'))).status, 503);
    assert.equal(calls, 2);
  });

  test('bad options throw at creation', () => {
    assert.throws(() => createFoliwakeHandler({ base: 'foliwake' }), /base/);
    assert.throws(() => createFoliwakeHandler({ authorizePreview: true }), /authorizePreview/);
    assert.throws(() => createFoliwakeHandler({ hook: { secretEnv: 'lower' } }), /secretEnv/);
  });
});
