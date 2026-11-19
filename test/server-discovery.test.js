// @foliwake/server/discovery: reading /.well-known/foliwake.json with a fake fetch, and its trust rules.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DISCOVERY_LIMIT, fetchDiscovery, parseDiscovery } from '@foliwake/server/discovery';
import { ORIGIN, discoveryDoc, jsonResponse } from './fixtures/discovery.js';

/** A fetch that answers from a list, recording each call. */
function fakeFetch(...answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  return { fetch, calls };
}

describe('parseDiscovery', () => {
  test('a document read from its live origin', () => {
    const doc = parseDiscovery(discoveryDoc(), ORIGIN);
    assert.deepEqual(doc, {
      site: 'my-site',
      live: { url: ORIGIN },
      preview: { url: 'https://my-site.preview.example.org' },
      media: { cdn: 'https://media.example.org' },
      contracts: { plain: 2, html: 2, blocks: 2, hook: 1 },
    });
    assert.ok(Object.isFrozen(doc));
  });

  test('no preview and no media are null; unknown keys are ignored', () => {
    const doc = parseDiscovery(discoveryDoc({ preview: null, media: { cdn: null }, later: { x: 1 } }), ORIGIN);
    assert.equal(doc.preview, null);
    assert.equal(doc.media, null);
  });

  const refused = [
    ['live.url of another origin', discoveryDoc({ live: { url: 'https://evil.example' } }), /was read from/],
    ['another discovery format', discoveryDoc({ foliwake: { discovery: 2 } }), /discovery format 2/],
    ['another plain contract', discoveryDoc({ contracts: { plain: 3 } }), /plain\/3/],
    ['a bad site name', discoveryDoc({ site: 'My Site' }), /"site"/],
    ['an http preview', discoveryDoc({ preview: { url: 'http://p.example.org' } }), /plain http/],
    ['a preview with a path', discoveryDoc({ preview: { url: 'https://p.example.org/x' } }), /origin only/],
    ['an http media CDN', discoveryDoc({ media: { cdn: 'http://127.0.0.1:9' } }), /must be https/],
    ['not an object', [], /not a JSON object/],
  ];
  for (const [name, doc, message] of refused) {
    test(`refused: ${name}`, () => assert.throws(() => parseDiscovery(doc, ORIGIN), message));
  }
});

describe('fetchDiscovery', () => {
  test('GET without redirects, Accept JSON, with a timeout signal', async () => {
    const { fetch, calls } = fakeFetch(jsonResponse(discoveryDoc()));
    const doc = await fetchDiscovery(`${ORIGIN}/`, { fetch });
    assert.equal(doc.site, 'my-site');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${ORIGIN}/.well-known/foliwake.json`);
    assert.equal(calls[0].init.redirect, 'manual');
    assert.equal(calls[0].init.headers.Accept, 'application/json');
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  });

  test('a network failure or a 5xx is tried once more', async () => {
    const network = fakeFetch(new TypeError('fetch failed'), jsonResponse(discoveryDoc()));
    assert.equal((await fetchDiscovery(ORIGIN, { fetch: network.fetch })).site, 'my-site');
    const busy = fakeFetch(jsonResponse('{}', { status: 503 }), jsonResponse(discoveryDoc()));
    assert.equal((await fetchDiscovery(ORIGIN, { fetch: busy.fetch })).site, 'my-site');
    assert.equal(busy.calls.length, 2);
  });

  test('a 4xx is not retried; a redirect is refused', async () => {
    const missing = fakeFetch(jsonResponse('{}', { status: 404 }));
    await assert.rejects(fetchDiscovery(ORIGIN, { fetch: missing.fetch }), /without discovery/);
    assert.equal(missing.calls.length, 1);
    const moved = fakeFetch(jsonResponse('', { status: 302, headers: { location: 'https://evil.example/' } }));
    await assert.rejects(fetchDiscovery(ORIGIN, { fetch: moved.fetch }), /redirects \(HTTP 302\)/);
  });

  test('refused: not JSON, too large, not valid JSON', async () => {
    const html = new Response('<html>', { headers: { 'content-type': 'text/html' } });
    await assert.rejects(fetchDiscovery(ORIGIN, { fetch: fakeFetch(html).fetch }), /not application\/json/);
    const big = jsonResponse(`"${'x'.repeat(DISCOVERY_LIMIT)}"`);
    await assert.rejects(fetchDiscovery(ORIGIN, { fetch: fakeFetch(big).fetch }), /larger than 16384 bytes/);
    await assert.rejects(fetchDiscovery(ORIGIN, { fetch: fakeFetch(jsonResponse('{x')).fetch }), /not valid JSON/);
  });

  test('FOLIWAKE_URL itself is checked like a config origin', async () => {
    const { fetch, calls } = fakeFetch();
    await assert.rejects(fetchDiscovery('http://my-site.example.org', { fetch }), /plain http/);
    await assert.rejects(fetchDiscovery('https://u:p@my-site.example.org', { fetch }), /user name or password/);
    assert.equal(calls.length, 0);
  });

  test('a loopback http origin is allowed (local engine)', async () => {
    const local = 'http://127.0.0.1:4100';
    const doc = discoveryDoc({ live: { url: local }, preview: null, media: null });
    assert.equal((await fetchDiscovery(local, { fetch: fakeFetch(jsonResponse(doc)).fetch })).live.url, local);
  });
});
