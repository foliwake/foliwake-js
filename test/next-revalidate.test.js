// @foliwake/next/revalidate without Next: the hook endpoint (revalidate-core) with fake tag expiry, warm-up and
// clock, driven by real Request objects.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { signFoliwakeHook } from '@foliwake/server/hook';
import { createRevalidateHandler, WARM_LIMIT } from '../packages/next/dist/revalidate-core.js';

const SECRET = 's'.repeat(40);
const PREVIOUS = 'p'.repeat(40);
const NOW_S = 1_763_470_000;
const VERSION = JSON.parse(readFileSync(new URL('../packages/next/package.json', import.meta.url), 'utf8')).version;

const delivery = (extra = {}) => ({
  version: 1,
  event: 'delivery.settled',
  site: 'demo',
  generation: 418,
  release: 'sr_1',
  codeRelease: 'cd_1',
  operation: { id: 'op_1', kind: 'content_publish' },
  pages: ['/lessons/x', '/lessons/query-index.json'],
  all: false,
  verified: true,
  sentAt: '2026-11-18T12:00:00.000Z',
  ...extra,
});
const PING = { version: 1, event: 'ping', site: 'demo', sentAt: '2026-11-18T12:00:00.000Z' };

function harness(extra = {}) {
  const calls = { expired: [], warmed: [], delivered: [], scheduled: [], logged: [] };
  const handler = createRevalidateHandler({
    site: 'demo',
    secrets: () => [SECRET, extra.previous],
    liveTag: (path) => (path === undefined ? 'foliwake:demo:live' : `foliwake:demo:live:page:${path}`),
    expire: (tag) => calls.expired.push(tag),
    warm: async (path) => calls.warmed.push(path),
    schedule: (task) => calls.scheduled.push(task),
    warmPages: extra.warmPages ?? true,
    onDelivery: extra.onDelivery ?? ((payload) => calls.delivered.push(payload)),
    now: () => NOW_S * 1000,
    log: { warn: (...a) => calls.logged.push(a), error: (...a) => calls.logged.push(a) },
  });
  const runScheduled = async () => {
    for (const task of calls.scheduled) await task();
  };
  return { handler, calls, runScheduled };
}

function signed(payload, { secret = SECRET, t = NOW_S, event = payload.event } = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers = {
    'content-type': 'application/json',
    'foliwake-event': event,
    'foliwake-delivery': crypto.randomUUID(),
    'foliwake-signature': signFoliwakeHook(body, secret, t),
  };
  return new Request('https://app.example/api/webhooks/foliwake', { method: 'POST', headers, body });
}

describe('signature and window', () => {
  test('a wrong signature → 401, nothing expired', async () => {
    const { handler, calls } = harness();
    const response = await handler(signed(delivery(), { secret: 'x'.repeat(40) }));
    assert.equal(response.status, 401);
    assert.deepEqual(calls.expired, []);
  });

  test('a signature older than 300 s → 401', async () => {
    const { handler } = harness();
    assert.equal((await handler(signed(delivery(), { t: NOW_S - 301 }))).status, 401);
  });

  test('the previous secret → 200', async () => {
    const { handler } = harness({ previous: PREVIOUS });
    assert.equal((await handler(signed(delivery(), { secret: PREVIOUS }))).status, 200);
  });

  test('no secret configured → 500, never accepted', async () => {
    const handler = createRevalidateHandler({
      site: 'demo',
      secrets: () => [undefined],
      liveTag: () => 'x',
      expire: () => assert.fail('expired'),
      warm: async () => {},
      schedule: () => {},
      warmPages: false,
      log: { warn() {}, error() {} },
    });
    assert.equal((await handler(signed(delivery()))).status, 500);
  });
});

describe('payload', () => {
  test('another site → 400', async () => {
    const { handler, calls } = harness();
    assert.equal((await handler(signed(delivery({ site: 'other' })))).status, 400);
    assert.deepEqual(calls.expired, []);
  });

  test('a body that is not a payload → 400', async () => {
    const { handler } = harness();
    assert.equal((await handler(signed('{"version":1}', { event: 'delivery.settled' }))).status, 400);
  });

  test('Foliwake-Event that contradicts the body → 400', async () => {
    const { handler } = harness();
    assert.equal((await handler(signed(delivery(), { event: 'ping' }))).status, 400);
  });

  test('a body over 64 KiB → 413', async () => {
    const { handler } = harness();
    const big = JSON.stringify(delivery({ padding: 'x'.repeat(70_000) }));
    assert.equal((await handler(signed(big, { event: 'delivery.settled' }))).status, 413);
  });

  test('GET → 405', async () => {
    const { handler } = harness();
    assert.equal((await handler(new Request('https://app.example/hook'))).status, 405);
  });
});

describe('ping', () => {
  test('answers the site and the SDK version and expires nothing', async () => {
    const { handler, calls } = harness();
    const response = await handler(signed(PING));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, site: 'demo', sdk: `@foliwake/next/${VERSION}` });
    assert.deepEqual(calls.expired, []);
    assert.deepEqual(calls.delivered, []);
  });
});

describe('delivery', () => {
  test('each path → its page tag, the index path too; onDelivery gets the payload', async () => {
    const { handler, calls } = harness();
    const response = await handler(signed(delivery()));
    const tags = ['foliwake:demo:live:page:/lessons/x', 'foliwake:demo:live:page:/lessons/query-index.json'];
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, revalidated: tags });
    assert.deepEqual(calls.expired, tags);
    assert.equal(calls.delivered.length, 1);
    assert.equal(calls.delivered[0].generation, 418);
  });

  test('all → one site tag, pages ignored, no warm-up', async () => {
    const { handler, calls, runScheduled } = harness();
    const response = await handler(signed(delivery({ all: true, pages: undefined })));
    assert.deepEqual(await response.json(), { ok: true, revalidated: ['foliwake:demo:live'] });
    assert.deepEqual(calls.expired, ['foliwake:demo:live']);
    await runScheduled();
    assert.deepEqual(calls.warmed, []);
  });

  test('warm reads the changed pages after the response, not the index', async () => {
    const { handler, calls, runScheduled } = harness();
    await handler(signed(delivery()));
    assert.deepEqual(calls.warmed, []);
    await runScheduled();
    assert.deepEqual(calls.warmed, ['/lessons/x']);
  });

  test(`warm reads at most ${WARM_LIMIT} pages`, async () => {
    const { handler, calls, runScheduled } = harness();
    const pages = Array.from({ length: 30 }, (_, i) => `/lessons/p${i}`);
    await handler(signed(delivery({ pages })));
    await runScheduled();
    assert.equal(calls.expired.length, 30);
    assert.equal(calls.warmed.length, WARM_LIMIT);
  });

  test('warm: false reads nothing', async () => {
    const { handler, calls, runScheduled } = harness({ warmPages: false });
    await handler(signed(delivery()));
    await runScheduled();
    assert.deepEqual(calls.warmed, []);
  });

  test('onDelivery throws → 500 after the tags were expired (the server retries)', async () => {
    const { handler, calls } = harness({ onDelivery: () => Promise.reject(new Error('db down')) });
    const response = await handler(signed(delivery()));
    assert.equal(response.status, 500);
    assert.equal(calls.expired.length, 2);
  });
});
