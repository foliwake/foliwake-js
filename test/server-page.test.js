// @foliwake/server/page and ./origin: envelope read against a stub origin; preparation per request.
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import { parseFoliwakeConfig } from '@foliwake/server/config';
import { createOriginClient } from '@foliwake/server/origin';
import { preparePage, readEnvelope } from '@foliwake/server/page';
import { CD, SHA, configText, startStubOrigin } from './helpers/stub-origin.js';

const HTML = `<h1>A</h1><p><a href="/lessons/b">b</a> <a href="https://example.org/">ext</a></p><img src="/media/${SHA}.png" srcset="/media/${SHA}.png 480w, /media/${SHA}.png 960w" alt=""><div data-component="question"><p>Q</p></div>`;
const plain = (extra = {}) => ({ headers: { 'content-type': 'text/html; charset=utf-8', 'x-code-release': CD, 'x-html-contract': '2', 'content-language': 'ru', 'x-page-id': 'pg_1', etag: '"p2-abc"', 'x-site-generation': 'g1', ...extra }, body: HTML });

let stub;
let config;
const env = { DEMO_LIVE_PASSWORD: 'live-secret', DEMO_PREVIEW_PASSWORD: 'preview-secret' };
before(async () => {
  stub = await startStubOrigin({
    '/lessons/a.plain.html': plain(),
    '/lessons/light_signals.plain.html': plain(),
    '/lessons/no-etag.plain.html': (() => { const p = plain(); delete p.headers.etag; return p; })(),
    '/index.plain.html': plain(),
    '/lessons/gz.plain.html': (() => { const p = plain(); const body = gzipSync(p.body); return { headers: { ...p.headers, 'content-encoding': 'gzip', 'content-length': String(body.length) }, body }; })(),
    '/lessons/no-cd.plain.html': { headers: { 'content-type': 'text/html', 'x-html-contract': '2' }, body: '<p>x</p>' },
    '/lessons/bad-cd.plain.html': plain({ 'x-code-release': 'cd_XYZ' }),
    '/lessons/local.plain.html': plain({ 'x-code-release': 'local' }),
    '/lessons/json.plain.html': { headers: { 'content-type': 'application/json', 'x-html-contract': '2' }, body: '{}' },
    '/lessons/script.plain.html': { ...plain(), body: '<p>x</p><script>alert(1)</script>' },
    '/lessons/latin1.plain.html': { ...plain(), body: Buffer.from([0x3c, 0x70, 0x3e, 0xff, 0x3c, 0x2f, 0x70, 0x3e]) },
    '/lessons/denied.plain.html': { status: 401, headers: {} },
    '/lessons/broken.plain.html': { status: 503, headers: {} },
    '/lessons/moved.plain.html': { status: 302, headers: { location: 'https://elsewhere.example/' } },
    '/lessons/huge.plain.html': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'x-code-release': CD, 'x-html-contract': '2' }); // chunked
      const chunk = Buffer.alloc(64 * 1024, 0x61);
      let sent = 0;
      const write = () => { while (sent < 3 * 1024 * 1024) { sent += chunk.length; if (!res.write(chunk)) return res.once('drain', write); } res.end(); };
      res.on('error', () => {}); write();
    },
    '/lessons/declared-huge.plain.html': (req, res) => { res.writeHead(200, { 'content-type': 'text/html', 'x-code-release': CD, 'x-html-contract': '2', 'content-length': String(3 * 1024 * 1024) }); res.end(); },
  });
  config = parseFoliwakeConfig(configText({ live: stub.origin, preview: stub.origin, app: { media: { base: 'https://media.example.org', transform: 'cloudflare-images' } } }));
});
after(() => stub?.close());

const read = (path, channel = 'live', e = env) => readEnvelope(config, createOriginClient(config, e), 'demo', channel, path);
const kind = (k) => (error) => error.name === 'FoliwakePageError' && error.kind === k;

describe('readEnvelope', () => {
  test('reads body and metadata; credentials from the named variable, per request; nothing else sent', async () => {
    const envelope = await read('/lessons/a');
    assert.deepEqual({ ...envelope, html: undefined }, { site: 'demo', channel: 'live', path: '/lessons/a', html: undefined, codeRelease: CD, htmlContract: '2', lang: 'ru', pageId: 'pg_1', etag: '"p2-abc"', generation: 'g1' });
    assert.equal(envelope.html, HTML);
    const last = stub.requests.at(-1);
    assert.equal(last.path, '/lessons/a.plain.html');
    assert.equal(last.headers.authorization, `Basic ${Buffer.from('app:live-secret').toString('base64')}`);
    assert.equal(last.headers.cookie, undefined);
    await read('/lessons/a', 'preview');
    assert.equal(stub.requests.at(-1).headers.authorization, `Basic ${Buffer.from('app:preview-secret').toString('base64')}`);
    const rotated = { ...env, DEMO_LIVE_PASSWORD: 'rotated' };
    await read('/lessons/a', 'live', rotated);
    assert.equal(stub.requests.at(-1).headers.authorization, `Basic ${Buffer.from('app:rotated').toString('base64')}`);
  });

  test('a path segment may join words with _', async () => {
    assert.equal((await read('/lessons/light_signals')).path, '/lessons/light_signals');
    assert.equal(stub.requests.at(-1).path, '/lessons/light_signals.plain.html');
  });

  test('a gzip-encoded body is read decoded', async () => {
    assert.equal((await read('/lessons/gz')).html, HTML);
  });

  test('/ reads /index.plain.html', async () => {
    assert.equal((await read('/')).path, '/');
    assert.equal(stub.requests.at(-1).path, '/index.plain.html');
  });

  test('a missing password names the variable and never a value', async () => {
    await assert.rejects(read('/lessons/a', 'live', {}), (e) => e.name === 'FoliwakeConfigError' && /DEMO_LIVE_PASSWORD/.test(e.message));
  });

  test('paths outside app.pages, other sites and malformed paths are refused before any request', async () => {
    const before = stub.requests.length;
    await assert.rejects(read('/drafts/x'), kind('not_allowed'));
    await assert.rejects(readEnvelope(config, createOriginClient(config, env), 'other', 'live', '/lessons/a'), kind('not_allowed'));
    await assert.rejects(read('/lessons/../x'), kind('not_found'));
    await assert.rejects(read('/lessons/A'), kind('not_found'));
    for (const malformed of ['/lessons/a__b', '/lessons/a_', '/lessons/a_-b']) await assert.rejects(read(malformed), kind('not_found'), malformed);
    assert.equal(stub.requests.length, before);
  });

  test('statuses map to error kinds', async () => {
    await assert.rejects(read('/lessons/nope'), kind('not_found'));
    await assert.rejects(read('/lessons/denied'), kind('unauthorized'));
    await assert.rejects(read('/lessons/broken'), (e) => kind('origin')(e) && e.status === 503);
    await assert.rejects(read('/lessons/moved'), (e) => kind('origin')(e) && e.status === 302);
  });

  test('X-Code-Release is required: missing or malformed is refused; "local" only from a loopback origin', async () => {
    await assert.rejects(read('/lessons/no-cd'), (e) => kind('invalid')(e) && /without X-Code-Release/.test(e.message));
    await assert.rejects(read('/lessons/bad-cd'), kind('invalid'));
    assert.equal((await read('/lessons/local')).codeRelease, 'local'); // the stub is loopback
  });

  test('type, encoding and body policy are checked before anything can cache the envelope', async () => {
    await assert.rejects(read('/lessons/json'), kind('invalid'));
    await assert.rejects(read('/lessons/latin1'), kind('invalid'));
    await assert.rejects(read('/lessons/script'), kind('invalid'));
  });

  test('size: a declared and an undeclared oversize body are both refused', async () => {
    await assert.rejects(read('/lessons/declared-huge'), kind('too_large'));
    await assert.rejects(read('/lessons/huge'), kind('too_large'));
  });
});

describe('preparePage', () => {
  test('live: media through the transforming host, links rewritten by the app, blocks URL and identity', async () => {
    const page = preparePage(config, await read('/lessons/a'), { rewriteLink: (href) => `/ge/ru${href}` });
    assert.match(page.html, new RegExp(`src="https://media\\.example\\.org/cdn-cgi/image/width=960,format=auto,quality=80,metadata=none/media/${SHA}\\.png"`));
    assert.match(page.html, /srcset="https:\/\/media\.example\.org\/cdn-cgi\/image\/width=480,[^ ]+ 480w, https:\/\/media\.example\.org\/cdn-cgi\/image\/width=960,[^ ]+ 960w"/);
    assert.match(page.html, /href="\/ge\/ru\/lessons\/b"/);
    assert.match(page.html, /href="https:\/\/example\.org\/"/);
    assert.equal(page.blocksUrl, `/foliwake-code/${CD}/scripts/blocks.js`);
    assert.equal(page.codeBase, `/foliwake-code/${CD}/`);
    assert.deepEqual(page.blocks, ['question']);
    assert.match(page.identity, new RegExp(`^demo\\|live\\|/lessons/a\\|"p2-abc"\\|${CD}\\|\\|[A-Za-z0-9_-]{22}$`), 'no mode: an empty identity part');
    assert.equal(page.mode, null);
    assert.equal(preparePage(config, await read('/lessons/a'), { rewriteLink: (href) => `/ge/ru${href}` }).identity, page.identity, 'the same prepared page keeps its identity');
    assert.deepEqual(page.contract, { major: 2, eventPrefix: 'demo' });
  });

  test('preview: media only through the authorised proxy, never the public media host; another identity', async () => {
    const page = preparePage(config, await read('/lessons/a', 'preview'));
    assert.ok(!page.html.includes('media.example.org'));
    assert.match(page.html, new RegExp(`src="/foliwake-media/preview/${SHA}\\.png"`));
    assert.equal(page.blocksUrl, `/foliwake-code/preview/${CD}/scripts/blocks.js`);
    assert.notEqual(page.identity, preparePage(config, await read('/lessons/a')).identity);
  });

  const svgTest =
    'an SVG reference image (engine content-components.md §3.7) goes through the media proxy, never the transform';
  test(svgTest, async () => {
    const { mediaRewriter } = await import('../packages/server/dist/media-rewrite.js');
    const live = mediaRewriter(config.app, 'live');
    const preview = mediaRewriter(config.app, 'preview');
    assert.equal(live.src(`/media/${SHA}.svg`, undefined), `/foliwake-media/${SHA}.svg`);
    assert.equal(preview.src(`/media/${SHA}.svg`, undefined), `/foliwake-media/preview/${SHA}.svg`);
    assert.equal(live.src(`/media/${SHA}.html`, undefined), `/media/${SHA}.html`);
  });

  test('live without a transform: media through the proxy', async () => {
    const plainConfig = parseFoliwakeConfig(configText({ live: stub.origin }));
    const page = preparePage(plainConfig, await readEnvelope(plainConfig, createOriginClient(plainConfig, env), 'demo', 'live', '/lessons/a'));
    assert.match(page.html, new RegExp(`src="/foliwake-media/${SHA}\\.png"`));
  });

  test('the app transform runs after the cache and its output is checked again', async () => {
    const envelope = await read('/lessons/a');
    const seen = [];
    const page = preparePage(config, envelope, { transform: (html, env2) => { seen.push(env2.path); return html.replace('<h1>A</h1>', '<h1>A!</h1>'); } });
    assert.deepEqual(seen, ['/lessons/a']);
    assert.match(page.html, /<h1>A!<\/h1>/);
    assert.throws(() => preparePage(config, envelope, { transform: (html) => `${html}<script>x()</script>` }), kind('invalid'));
    assert.throws(() => preparePage(config, envelope, { transform: (html) => html.replace('<h1>', '<h1 onmouseover="x()">') }), kind('invalid'));
    assert.throws(() => preparePage(config, envelope, { rewriteLink: () => 'javascript:x()' }), kind('invalid'));
  });

  test('identity follows the final prepared body: a changed transform or link rewrite gives a new identity', async () => {
    const envelope = await read('/lessons/a');
    const base = preparePage(config, envelope).identity;
    assert.equal(preparePage(config, envelope).identity, base);
    assert.equal(preparePage(config, envelope, { transform: (html) => html }).identity, base, 'an identity transform changes nothing');
    const transformed = preparePage(config, envelope, { transform: (html) => html.replace('<h1>A</h1>', '<h1>B</h1>') }).identity;
    assert.notEqual(transformed, base);
    assert.notEqual(preparePage(config, envelope, { rewriteLink: (href) => `/x${href}` }).identity, base);
    assert.notEqual(preparePage(config, envelope, { mode: 'review' }).identity, base);
    const otherPrefix = parseFoliwakeConfig(configText({ live: stub.origin, preview: stub.origin, app: { media: { base: 'https://media.example.org', transform: 'cloudflare-images' }, blocks: { entry: 'scripts/blocks.js', eventPrefix: 'other' } } }));
    assert.notEqual(preparePage(otherPrefix, envelope).identity, base, 'a mount-defining setting changes the identity');
  });

  test('without an ETag two different bodies of one path never share an identity', async () => {
    const envelope = await read('/lessons/no-etag');
    assert.equal(envelope.etag, null);
    const a = preparePage(config, envelope);
    const b = preparePage(config, { ...envelope, html: envelope.html.replace('<h1>A</h1>', '<h1>Changed</h1>') });
    assert.notEqual(a.identity, b.identity);
    assert.equal(preparePage(config, envelope).identity, a.identity);
  });

  test('exam mode is not available yet', async () => {
    const live = await read('/lessons/a');
    assert.throws(() => preparePage(config, live, { mode: 'exam' }), kind('not_allowed'));
  });

  test('mode is the site\'s token: in the page and its identity; anything but a token is refused', async () => {
    const live = await read('/lessons/a');
    const page = preparePage(config, live, { mode: 'print-view' });
    assert.equal(page.mode, 'print-view');
    assert.match(page.identity, new RegExp(`\\|${CD}\\|print-view\\|`));
    for (const mode of ['Print', '1x', 'a b', 'a|b', 'x'.repeat(33), '']) assert.throws(() => preparePage(config, live, { mode }), kind('invalid'), mode);
  });
});
