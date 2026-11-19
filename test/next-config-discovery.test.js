// withFoliwake with FOLIWAKE_URL: the discovery document is read when next.config loads and inlined as a snapshot
// (nothing fetched at run time); CSP img-src from media.cdn; a failure names the address. Without FOLIWAKE_URL the
// version 2 file path is unchanged (a plain object, not a promise).
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, test } from 'node:test';
import { withFoliwake } from '../packages/next/dist/config.js';
import { configOfInlined, loadConfigSync } from '../packages/next/dist/settings.js';
import { startStubOrigin } from './helpers/stub-origin.js';
import { discoveryDoc } from './fixtures/discovery.js';

let stub;
let dir;
before(async () => {
  stub = await startStubOrigin({
    '/.well-known/foliwake.json': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(discoveryDoc({ site: 'demo', live: { url: stub.origin }, preview: null })));
    },
  });
  dir = await mkdtemp(path.join(os.tmpdir(), 'fw-next-config-'));
  process.chdir(dir); // no foliwake.remote.json here
});
after(async () => {
  await stub?.close();
  await rm(dir, { recursive: true, force: true });
});
afterEach(() => {
  delete process.env.FOLIWAKE_URL;
});

const inlinedOf = (config) => JSON.parse(config.env.FOLIWAKE_APP_CONFIG);

describe('with FOLIWAKE_URL', () => {
  test('a promise of the config, with the snapshot inlined and the package transpiled', async () => {
    process.env.FOLIWAKE_URL = stub.origin;
    const result = withFoliwake({ cacheComponents: true }); // no file in the working directory
    assert.ok(result instanceof Promise);
    const config = await result;
    assert.equal(config.cacheComponents, true);
    assert.ok(config.transpilePackages.includes('@foliwake/next'));
    const inlined = inlinedOf(config);
    assert.equal(inlined.snapshot.url, stub.origin);
    assert.equal(inlined.snapshot.discovery.site, 'demo');
    const resolved = configOfInlined(inlined);
    assert.equal(resolved.version, 3);
    assert.equal(resolved.app.proxies.code, '/foliwake/code');
  });

  test('the version 3 file is merged; CSP img-src gets the media CDN', async () => {
    process.env.FOLIWAKE_URL = stub.origin;
    const file = path.join(dir, 'foliwake.remote.json');
    await writeFile(file, JSON.stringify({ version: 3, app: { revalidate: 30 } }));
    const config = await withFoliwake({}, { configFile: file, csp: {} });
    assert.equal(configOfInlined(inlinedOf(config)).app.revalidate, 30);
    const [{ headers }] = await config.headers();
    assert.match(headers[0].value, /img-src 'self' data: blob: https:\/\/media\.example\.org/);
  });

  test('a discovery failure fails the build with the address', async () => {
    process.env.FOLIWAKE_URL = 'http://127.0.0.1:9';
    const failing = withFoliwake({});
    await assert.rejects(failing, /^Error: withFoliwake: http:\/\/127\.0\.0\.1:9\/\.well-known\/foliwake\.json/);
  });
});

describe('without FOLIWAKE_URL', () => {
  test('a version 2 file: a plain object, the file inlined as before', async () => {
    const file = path.join(dir, 'v2.json');
    const text = JSON.stringify({ version: 2, site: 'demo', live: { url: stub.origin }, app: { pages: ['/**'] } });
    await writeFile(file, text);
    const config = withFoliwake({}, { configFile: file });
    assert.ok(!(config instanceof Promise));
    assert.deepEqual(inlinedOf(config), { file: 'v2.json', text });
    assert.equal(configOfInlined(inlinedOf(config)).version, 2);
  });

  test('a missing file names both ways to configure', () => {
    assert.throws(() => withFoliwake({}, { configFile: path.join(dir, 'none.json') }), /Set FOLIWAKE_URL, or create/);
  });
});

test('run time without withFoliwake: FOLIWAKE_URL alone says to wrap next.config', () => {
  process.env.FOLIWAKE_URL = stub.origin;
  delete process.env.FOLIWAKE_APP_CONFIG;
  assert.throws(() => loadConfigSync(), /does not use withFoliwake\(\)/);
});
