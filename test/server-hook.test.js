// @foliwake/server/hook: the signature of the hook a Foliwake server sends, and its payload.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  FoliwakeHookError,
  isFoliwakePagePath,
  parseFoliwakeHook,
  signFoliwakeHook,
  verifyFoliwakeSignature,
} from '@foliwake/server/hook';

const SECRET = 'a'.repeat(40);
const OLD_SECRET = 'b'.repeat(40);
const NOW_S = 1_763_470_000;
const NOW = NOW_S * 1000;

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

describe('verifyFoliwakeSignature', () => {
  const body = JSON.stringify(delivery());

  test('accepts the signature of the current secret', () => {
    const header = signFoliwakeHook(body, SECRET, NOW_S);
    assert.deepEqual(verifyFoliwakeSignature(body, header, [SECRET], { now: NOW }), { ok: true });
  });

  test('accepts the previous secret while it is rotated', () => {
    const header = signFoliwakeHook(body, OLD_SECRET, NOW_S);
    assert.deepEqual(verifyFoliwakeSignature(body, header, [SECRET, OLD_SECRET], { now: NOW }), { ok: true });
  });

  test('signs the raw bytes: a string and its UTF-8 bytes give the same signature', () => {
    const header = signFoliwakeHook(body, SECRET, NOW_S);
    const bytes = new TextEncoder().encode(body);
    assert.deepEqual(verifyFoliwakeSignature(bytes, header, [SECRET], { now: NOW }), { ok: true });
  });

  test('the signed text is `${t}.${body}` with a hex HMAC-SHA256', async () => {
    const { createHmac } = await import('node:crypto');
    const hex = createHmac('sha256', SECRET).update(`${NOW_S}.${body}`).digest('hex');
    assert.equal(signFoliwakeHook(body, SECRET, NOW_S), `t=${NOW_S},v1=${hex}`);
  });

  test('refuses another secret, a changed body and a missing header', () => {
    const header = signFoliwakeHook(body, SECRET, NOW_S);
    const check = (b, h, s) => verifyFoliwakeSignature(b, h, s, { now: NOW });
    assert.deepEqual(check(body, header, [OLD_SECRET]), { ok: false, reason: 'mismatch' });
    assert.deepEqual(check(`${body} `, header, [SECRET]), { ok: false, reason: 'mismatch' });
    assert.deepEqual(check(body, null, [SECRET]), { ok: false, reason: 'malformed' });
    assert.deepEqual(check(body, 't=1,v1=zz', [SECRET]), { ok: false, reason: 'malformed' });
  });

  test('the window is 300 s on both sides, inclusive', () => {
    const at = (t) => verifyFoliwakeSignature(body, signFoliwakeHook(body, SECRET, t), [SECRET], { now: NOW });
    assert.deepEqual(at(NOW_S - 300), { ok: true });
    assert.deepEqual(at(NOW_S + 300), { ok: true });
    assert.deepEqual(at(NOW_S - 301), { ok: false, reason: 'expired' });
    assert.deepEqual(at(NOW_S + 301), { ok: false, reason: 'expired' });
  });

  test('toleranceS narrows the window', () => {
    const header = signFoliwakeHook(body, SECRET, NOW_S - 10);
    const check = verifyFoliwakeSignature(body, header, [SECRET], { now: NOW, toleranceS: 5 });
    assert.deepEqual(check, { ok: false, reason: 'expired' });
  });

  test('without a secret nothing is accepted', () => {
    const header = signFoliwakeHook(body, '', NOW_S);
    assert.deepEqual(verifyFoliwakeSignature(body, header, ['', undefined], { now: NOW }), {
      ok: false,
      reason: 'no_secret',
    });
  });
});

describe('parseFoliwakeHook', () => {
  test('reads a delivery', () => {
    assert.deepEqual(parseFoliwakeHook(JSON.stringify(delivery())), delivery());
  });

  test('reads a ping', () => {
    const ping = { version: 1, event: 'ping', site: 'demo', sentAt: '2026-11-18T12:00:00.000Z' };
    assert.deepEqual(parseFoliwakeHook(JSON.stringify(ping)), ping);
  });

  test('all: true drops pages', () => {
    const parsed = parseFoliwakeHook(JSON.stringify(delivery({ all: true, pages: undefined, release: null })));
    assert.equal(parsed.all, true);
    assert.equal('pages' in parsed, false);
    assert.equal(parsed.release, null);
  });

  test('accepts an operation kind it does not know', () => {
    const parsed = parseFoliwakeHook(JSON.stringify(delivery({ operation: { id: 'op_2', kind: 'future_kind' } })));
    assert.equal(parsed.operation.kind, 'future_kind');
  });

  test('refuses what is not a version 1 payload', () => {
    const refused = (value) => assert.throws(() => parseFoliwakeHook(value), FoliwakeHookError);
    refused('not json');
    refused(JSON.stringify(delivery({ version: 2 })));
    refused(JSON.stringify(delivery({ event: 'other' })));
    refused(JSON.stringify(delivery({ generation: '418' })));
    refused(JSON.stringify(delivery({ generation: -1 })));
    refused(JSON.stringify(delivery({ pages: undefined })));
    refused(JSON.stringify(delivery({ pages: ['relative'] })));
    refused(JSON.stringify(delivery({ pages: Array.from({ length: 101 }, (_, i) => `/p${i}`) })));
    refused(JSON.stringify(delivery({ site: '' })));
    refused(new Uint8Array([0xff, 0xfe]));
  });
});

test('isFoliwakePagePath: pages, not other files', () => {
  assert.equal(isFoliwakePagePath('/lessons/x'), true);
  assert.equal(isFoliwakePagePath('/'), true);
  assert.equal(isFoliwakePagePath('/lessons/query-index.json'), false);
  assert.equal(isFoliwakePagePath('/sitemap.xml'), false);
});
