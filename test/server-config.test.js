// @foliwake/server/config: config v2 parser, JSON Schema agreement, client projection.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { clientSettings, configFilePath, loadFoliwakeConfig, pageAllowed, parseFoliwakeConfig, FoliwakeConfigError } from '@foliwake/server/config';

const require = createRequire(import.meta.url);
const schema = require('@foliwake/server/schemas/remote-2.schema.json');
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

const auth = { type: 'basic', username: 'my-app-reader', passwordEnv: 'FOLIWAKE_LIVE_PASSWORD' };
const serviceAuth = {
  type: 'service-token',
  issuer: 'my-app',
  kid: 'my-app-2026-11',
  privateKeyEnv: 'FOLIWAKE_LIVE_SIGNING_KEY',
};
/** A valid config whose live endpoint has this `auth`. */
const withLiveAuth = (liveAuth) => ({ ...base(), live: { url: 'https://l.example', auth: liveAuth } });
const base = () => ({
  version: 2,
  site: 'acme',
  live: { url: 'https://live.example.org', auth },
  preview: { url: 'https://preview.example.org', auth: { ...auth, passwordEnv: 'FOLIWAKE_PREVIEW_PASSWORD' } },
  app: {
    pages: ['/lessons/**'],
    proxies: { code: '/foliwake-code', media: '/foliwake-media', pages: null },
    blocks: { entry: 'scripts/blocks.js', contract: 'foliwake-blocks/2', eventPrefix: 'acme' },
    media: { base: 'https://media.example.org', transform: 'cloudflare-images' },
    revalidate: 300,
  },
});
const withApp = (app) => ({ ...base(), app: { ...base().app, ...app } });

// [description, config, expected error pattern]; the schema must refuse the same ones.
const REFUSED = [
  ['version 1', { version: 1, preview: { url: 'https://p.example' } }, /version 1 is no longer read/],
  ['version 3', { ...base(), version: 3 }, /"version" must be 2/],
  ['no site', { ...base(), site: undefined }, /"site"/],
  ['bad site', { ...base(), site: 'Acme' }, /"site"/],
  ['no channel', { version: 2, site: 'x', app: base().app }, /at least one of "live" and "preview"/],
  ['stored secret', { ...base(), live: { url: 'https://l.example', auth: { ...auth, password: 'x' } } }, /looks like a stored secret/],
  ['unknown top-level key', { ...base(), extra: 1 }, /unknown key "extra"/],
  ['unknown app key', withApp({ cache: 1 }), /unknown key "cache"/],
  ['http to a public host', { ...base(), live: { url: 'http://l.example' } }, /plain http/],
  ['url with path', { ...base(), live: { url: 'https://l.example/x' } }, /origin only/],
  ['password env is a value', { ...base(), live: { url: 'https://l.example', auth: { ...auth, passwordEnv: 'hunter 2' } } }, /NAME of an environment variable/],
  ['password env is a system variable', { ...base(), live: { url: 'https://l.example', auth: { ...auth, passwordEnv: 'HOME' } } }, /system/],
  ['password env browser-exposed', { ...base(), live: { url: 'https://l.example', auth: { ...auth, passwordEnv: 'NEXT_PUBLIC_PW' } } }, /browser-exposed/],
  ['no pages', withApp({ pages: [] }), /page globs/],
  ['bad glob', withApp({ pages: ['/lessons/a**'] }), /\*\* inside a segment/],
  ['glob not absolute', withApp({ pages: ['lessons/**'] }), /must start with \//],
  ['proxy under /api', withApp({ proxies: { code: '/api/code', media: '/foliwake-media' } }), /reserved app path \/api/],
  ['proxy /media', withApp({ proxies: { code: '/foliwake-code', media: '/media' } }), /reserved app path \/media/],
  ['proxy /code', withApp({ proxies: { code: '/code', media: '/m' } }), /reserved app path \/code/],
  ['proxies equal', withApp({ proxies: { code: '/f', media: '/f' } }), /different prefixes/],
  ['proxy inside another', withApp({ proxies: { code: '/f', media: '/f/media' } }), /neither inside the other/],
  ['proxy not a path', withApp({ proxies: { code: 'foliwake-code', media: '/m' } }), /absolute app path/],
  ['pages proxy in 0.1', withApp({ proxies: { code: '/c1', media: '/m1', pages: '/p' } }), /must be null/],
  ['entry outside scripts', withApp({ blocks: { entry: 'styles/blocks.js' } }), /inside a code release/],
  ['entry with ..', withApp({ blocks: { entry: 'scripts/../x.js' } }), /inside a code release/],
  ['entry not js', withApp({ blocks: { entry: 'scripts/blocks.mjs' } }), /inside a code release/],
  ['bad contract', withApp({ blocks: { contract: 'acme-blocks/1' } }), /foliwake-blocks/],
  ['bad event prefix', withApp({ blocks: { eventPrefix: 'Acme' } }), /eventPrefix/],
  ['media over http', withApp({ media: { base: 'http://media.example' } }), /https/],
  ['unknown transform', withApp({ media: { base: 'https://m.example', transform: 'imgix' } }), /cloudflare-images/],
  ['revalidate 0', withApp({ revalidate: 0 }), /revalidate/],
  ['unknown auth type', withLiveAuth({ type: 'bearer', tokenEnv: 'X_TOKEN' }), /"basic" or "service-token"/],
  ['service token without kid', withLiveAuth({ ...serviceAuth, kid: undefined }), /\.kid: the key id/],
  ['service token with a bad issuer', withLiveAuth({ ...serviceAuth, issuer: 'my app' }), /\.issuer: the issuer/],
  [
    'service token key env is a value',
    withLiveAuth({ ...serviceAuth, privateKeyEnv: '{"kty":"EC"}' }),
    /NAME of an environment variable/,
  ],
  ['service token with basic keys', withLiveAuth({ ...serviceAuth, username: 'x' }), /unknown key "username"/],
  ['stored private key', withLiveAuth({ ...serviceAuth, privateKey: { kty: 'EC' } }), /looks like a stored secret/],
];
// Refused by the TypeScript parser only (the schema cannot express these): checked separately.
const PARSER_ONLY = new Set([
  'version 1',
  'stored secret',
  'stored private key',
  'password env is a system variable',
  'password env browser-exposed',
  'bad glob',
  'proxy under /api',
  'proxy /media',
  'proxy /code',
  'proxies equal',
  'proxy inside another',
  'entry with ..',
  'http to a public host',
  'url with path',
  'media over http',
]);

describe('config v2', () => {
  test('a complete host-app config parses, frozen, with defaults filled', () => {
    const config = parseFoliwakeConfig(JSON.stringify(base()));
    assert.equal(config.site, 'acme');
    assert.deepEqual(config.live, { origin: 'https://live.example.org', auth });
    assert.deepEqual(config.app.blocks, { entry: 'scripts/blocks.js', contract: 'foliwake-blocks/2', major: 2, eventPrefix: 'acme' });
    assert.ok(Object.isFrozen(config));
    const minimal = parseFoliwakeConfig(JSON.stringify({ version: 2, site: 's', live: { url: 'http://127.0.0.1:9' }, app: { pages: ['/**'] } }));
    assert.deepEqual(minimal.app.proxies, { code: '/foliwake-code', media: '/foliwake-media', pages: null });
    assert.deepEqual(minimal.app.blocks, { entry: null, contract: 'foliwake-blocks/2', major: 2, eventPrefix: 'block' });
    assert.equal(minimal.app.revalidate, 300);
    assert.equal(minimal.app.media, null);
    assert.equal(minimal.preview, null);
  });

  test('a service-token endpoint parses next to a basic one', () => {
    const text = JSON.stringify({ ...base(), live: { url: 'https://site.worker.example', auth: serviceAuth } });
    const config = parseFoliwakeConfig(text);
    assert.deepEqual(config.live, { origin: 'https://site.worker.example', auth: serviceAuth });
    assert.deepEqual(config.preview.auth, { ...auth, passwordEnv: 'FOLIWAKE_PREVIEW_PASSWORD' });
  });

  test('app is required unless the caller is the engine CLI', () => {
    const cli = { version: 2, site: 's', preview: { url: 'https://p.example' } };
    assert.throws(() => parseFoliwakeConfig(JSON.stringify(cli)), /"app" is required/);
    assert.equal(parseFoliwakeConfig(JSON.stringify(cli), { requireApp: false }).app, null);
  });

  for (const [name, config, pattern] of REFUSED) {
    test(`refused: ${name}`, () => {
      assert.throws(() => parseFoliwakeConfig(JSON.stringify(config)), (error) => error instanceof FoliwakeConfigError && pattern.test(error.message));
      if (!PARSER_ONLY.has(name)) assert.equal(validate(config), false, `the schema accepts "${name}"`);
    });
  }

  test('the schema accepts what the parser accepts', () => {
    const worker = { ...base(), live: { url: 'https://site.worker.example', auth: serviceAuth } };
    const loopbackLive = { version: 2, site: 's', live: { url: 'http://127.0.0.1:9' }, app: { pages: ['/**'] } };
    const previewOnly = { version: 2, site: 's', preview: { url: 'https://p.example' } };
    for (const config of [base(), worker, loopbackLive, previewOnly]) {
      assert.equal(validate(config), true, JSON.stringify(validate.errors));
    }
  });

  test('the engine rule for credential names can be added', () => {
    const text = JSON.stringify({ ...base(), live: { url: 'https://l.example', auth: { ...auth, passwordEnv: 'FOLIWAKE_TOKEN' } } });
    assert.ok(parseFoliwakeConfig(text));
    assert.throws(() => parseFoliwakeConfig(text, { envNameProblem: (n) => (n === 'FOLIWAKE_TOKEN' ? 'own variable' : null) }), /own variable/);
  });

  test('page globs: /x/** matches /x, nothing outside matches', () => {
    const config = parseFoliwakeConfig(JSON.stringify(withApp({ pages: ['/lessons/**', '/about'] })));
    for (const p of ['/lessons', '/lessons/a', '/lessons/a/b', '/about']) assert.equal(pageAllowed(config, p), true, p);
    for (const p of ['/', '/lesson', '/about/x', '/drafts/lessons']) assert.equal(pageAllowed(config, p), false, p);
  });

  test('clientSettings is the explicit projection and nothing else', () => {
    const settings = clientSettings(parseFoliwakeConfig(JSON.stringify(base())));
    assert.deepEqual(settings, { site: 'acme', proxies: { code: '/foliwake-code', media: '/foliwake-media', pages: null }, blocks: { contract: 'foliwake-blocks/2', eventPrefix: 'acme' } });
    const text = JSON.stringify(settings);
    for (const hidden of ['example.org', 'my-app-reader', 'PASSWORD', '/lessons', 'scripts/blocks.js']) assert.ok(!text.includes(hidden), hidden);
  });

  test('which file: explicit beats FOLIWAKE_REMOTE beats ./foliwake.remote.json', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'foliwake-pkg-config-'));
    try {
      assert.equal(configFilePath({ cwd: dir, env: {} }), path.join(dir, 'foliwake.remote.json'));
      assert.equal(configFilePath({ cwd: dir, env: { FOLIWAKE_REMOTE: 'a.json' } }), path.join(dir, 'a.json'));
      assert.equal(configFilePath({ cwd: dir, file: 'b.json', env: { FOLIWAKE_REMOTE: 'a.json' } }), path.join(dir, 'b.json'));
      await assert.rejects(loadFoliwakeConfig({ cwd: dir, env: {} }), /does not exist/);
      await writeFile(path.join(dir, 'a.json'), JSON.stringify({ ...base(), site: 'from-env' }));
      assert.equal((await loadFoliwakeConfig({ cwd: dir, env: { FOLIWAKE_REMOTE: 'a.json' } })).site, 'from-env');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
