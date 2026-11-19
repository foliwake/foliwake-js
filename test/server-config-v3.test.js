// @foliwake/server/resolve: FOLIWAKE_URL + discovery + the optional version 3 file; version 2 unchanged;
// the remote-3 JSON Schema agrees with the parser.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseDiscovery } from '@foliwake/server/discovery';
import { configFromSnapshot, loadAppConfig, readConfigSnapshot } from '@foliwake/server/resolve';
import { ORIGIN, discoveryDoc, jsonResponse } from './fixtures/discovery.js';

const require = createRequire(import.meta.url);
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
  require('@foliwake/server/schemas/remote-3.schema.json'),
);

const discovery = parseDiscovery(discoveryDoc(), ORIGIN);
const v3 = (file) =>
  configFromSnapshot({ url: ORIGIN, discovery, file: 'foliwake.remote.json', text: JSON.stringify(file) });

const V2 = {
  version: 2,
  site: 'my-site',
  live: { url: 'https://live.example.org' },
  app: { pages: ['/lessons/**'], blocks: { entry: 'scripts/blocks.js', eventPrefix: 'demo' } },
};

describe('version 3: discovery with defaults', () => {
  test('no file: everything from the discovery document', () => {
    const config = configFromSnapshot({ url: ORIGIN, discovery, file: null, text: null });
    assert.equal(config.version, 3);
    assert.equal(config.site, 'my-site');
    assert.deepEqual(config.live, { origin: ORIGIN, auth: null });
    assert.deepEqual(config.preview, {
      origin: 'https://my-site.preview.example.org',
      auth: { type: 'basic', username: 'preview', passwordEnv: 'FOLIWAKE_PREVIEW_TOKEN' },
    });
    assert.deepEqual(config.app.pages, ['/**']);
    assert.deepEqual(config.app.proxies, { code: '/foliwake/code', media: '/foliwake/media', pages: null });
    assert.deepEqual(config.app.blocks, {
      entry: null,
      contract: 'foliwake-blocks/2',
      major: 2,
      eventPrefix: 'block',
      fromRelease: true,
    });
    assert.deepEqual(config.app.media, { base: 'https://media.example.org', transform: null });
    assert.equal(config.app.revalidate, 300);
  });

  test('a site without preview has no preview endpoint', () => {
    const noPreview = parseDiscovery(discoveryDoc({ preview: null, media: null }), ORIGIN);
    const config = configFromSnapshot({ url: ORIGIN, discovery: noPreview, file: null, text: null });
    assert.equal(config.preview, null);
    assert.equal(config.app.media, null);
  });
});

describe('version 3: the file overrides', () => {
  test('pages, revalidate, proxies, media, blocks and auth', () => {
    const config = v3({
      $schema: './node_modules/@foliwake/next/schemas/remote-3.schema.json',
      version: 3,
      site: 'my-site',
      preview: { auth: { type: 'basic', username: 'preview', passwordEnv: 'MY_PREVIEW_TOKEN' } },
      app: {
        pages: ['/lessons/**'],
        revalidate: 60,
        proxies: { code: '/fw-code', media: '/fw-media' },
        media: { base: 'https://img.example.org', transform: 'cloudflare-images' },
        blocks: { entry: 'scripts/app.js', eventPrefix: 'demo' },
      },
    });
    assert.deepEqual(config.app.pages, ['/lessons/**']);
    assert.equal(config.app.revalidate, 60);
    assert.equal(config.app.proxies.code, '/fw-code');
    assert.deepEqual(config.app.media, { base: 'https://img.example.org', transform: 'cloudflare-images' });
    assert.equal(config.app.blocks.entry, 'scripts/app.js');
    assert.equal(config.app.blocks.fromRelease, false);
    assert.equal(config.preview.auth.passwordEnv, 'MY_PREVIEW_TOKEN');
    assert.equal(config.live.origin, ORIGIN, 'the origins always come from discovery');
  });

  test('service-token live requires explicit pages', () => {
    const token = { type: 'service-token', issuer: 'my-app', kid: 'k1', privateKeyEnv: 'MY_SIGNING_KEY' };
    assert.throws(() => v3({ version: 3, live: { auth: token } }), /"app"\.pages: required when "live" uses a service/);
    assert.deepEqual(v3({ version: 3, live: { auth: token }, app: { pages: ['/open/**'] } }).app.pages, ['/open/**']);
  });

  const refused = [
    ['another site', { version: 3, site: 'other' }, /serves the site my-site/],
    ['a stored secret', { version: 3, preview: { auth: { password: 'x' } } }, /looks like a stored secret/],
    ['a url (origins come from discovery)', { version: 3, live: { url: 'https://x.example' } }, /unknown key "url"/],
    ['an unknown app key', { version: 3, app: { pagez: [] } }, /unknown key "pagez"/],
    ['a reserved proxy', { version: 3, app: { proxies: { code: '/api/x' } } }, /reserved app path/],
  ];
  for (const [name, file, message] of refused) {
    test(`refused: ${name}`, () => {
      assert.throws(() => v3(file), message);
      assert.equal(validate(file), name === 'another site' || name === 'a reserved proxy', `schema: ${name}`);
    });
  }
});

describe('version 2 keeps working', () => {
  test('without FOLIWAKE_URL a version 2 file is the whole config', () => {
    const config = configFromSnapshot({
      url: null,
      discovery: null,
      file: 'foliwake.remote.json',
      text: JSON.stringify(V2),
    });
    assert.equal(config.version, 2);
    assert.equal(config.live.origin, 'https://live.example.org');
    assert.deepEqual(config.app.proxies, { code: '/foliwake-code', media: '/foliwake-media', pages: null });
    assert.equal(config.app.blocks.fromRelease, false);
  });

  test('with FOLIWAKE_URL a version 2 file of the same site is used as it is', () => {
    const config = configFromSnapshot({
      url: ORIGIN,
      discovery,
      file: 'f.json',
      text: JSON.stringify({ ...V2, site: 'my-site' }),
    });
    assert.equal(config.version, 2);
    const other = { url: ORIGIN, discovery, file: 'f.json', text: JSON.stringify({ ...V2, site: 'other' }) };
    assert.throws(() => configFromSnapshot(other), /"site" is other, but FOLIWAKE_URL serves the site my-site/);
  });

  test('a version 3 file without FOLIWAKE_URL names the variable', () => {
    const snapshot = { url: null, discovery: null, file: 'foliwake.remote.json', text: '{"version": 3}' };
    assert.throws(() => configFromSnapshot(snapshot), /configured by FOLIWAKE_URL/);
  });
});

describe('readConfigSnapshot', () => {
  const dirs = [];
  after(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));
  const tmp = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'fw-v3-'));
    dirs.push(dir);
    return dir;
  };
  const fetch = async () => jsonResponse(discoveryDoc());

  test('FOLIWAKE_URL only: discovery read, no file', async () => {
    const snapshot = await readConfigSnapshot({ cwd: await tmp(), env: { FOLIWAKE_URL: ORIGIN }, fetch });
    assert.deepEqual(
      { ...snapshot, discovery: snapshot.discovery.site },
      {
        url: ORIGIN,
        discovery: 'my-site',
        file: null,
        text: null,
      },
    );
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot, 'plain JSON, so it can be inlined');
  });

  test('file and URL; a named file must exist; nothing at all is an error', async () => {
    const cwd = await tmp();
    await writeFile(path.join(cwd, 'foliwake.remote.json'), JSON.stringify({ version: 3, app: { revalidate: 30 } }));
    const config = await loadAppConfig({ cwd, env: { FOLIWAKE_URL: ORIGIN }, fetch });
    assert.equal(config.app.revalidate, 30);
    const missing = { cwd, env: { FOLIWAKE_URL: ORIGIN, FOLIWAKE_REMOTE: 'nope.json' }, fetch };
    await assert.rejects(readConfigSnapshot(missing), /nope\.json does not exist/);
    await assert.rejects(readConfigSnapshot({ cwd: await tmp(), env: {}, fetch }), /Set FOLIWAKE_URL/);
  });
});
