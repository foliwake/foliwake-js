// The built packages: directives and import comments survive the build; tarballs hold only what ships;
// one shared version and the compatibility metadata.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { PACKAGES, PUBLISH_ORDER } from '../tools/packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = PUBLISH_ORDER;
/** The app packages: they carry the origin and blocks contract versions they speak. */
const APP_PACKAGES = ['blocks-contract', 'server', 'client', 'react', 'next'];
const FORMATS = { htmlContract: 2, blocksPack: 1, templates: 1, references: 1, query: 1 };
/** What the other packages carry in `foliwake`: the versions they speak. */
const METADATA = { 'block-kit': { blocksContract: 2 }, 'core-contract': { coreApi: 1 }, cli: { coreApi: 1 }, foliwake: { coreApi: 1 } };
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const manifest = (name) => JSON.parse(read(`packages/${name}/package.json`));

test('the hook endpoints answer a ping with the built version', () => {
  for (const name of ['next', 'server']) {
    const stamped = read(`packages/${name}/dist/version.js`);
    assert.doesNotMatch(stamped, /__FOLIWAKE_[A-Z]+_VERSION__/);
    assert.ok(stamped.includes(`'@foliwake/${name}/${manifest(name).version}'`), name);
  }
});

test("'use client', 'use cache' and the runtime import comments are kept in dist/", () => {
  assert.match(read('packages/react/dist/index.js'), /^'use client';/);
  assert.match(read('packages/next/dist/client.js'), /^'use client';/);
  assert.match(read('packages/client/dist/load.js'), /import\(\/\* webpackIgnore: true \*\/ \/\* turbopackIgnore: true \*\/ \/\* @vite-ignore \*\/ url\)/);
  assert.match(read('packages/next/dist/cache.js'), /async function readEnvelopeCachedEntry\(path\) \{\s+'use cache';/);
  assert.doesNotMatch(read('packages/react/dist/foliwake-page.js'), /import\(/, 'the React wrapper imports no blocks module itself');
  for (const file of ['index.js', 'mount.js', 'events.js', 'host.js', 'load.js', 'import-map.js', 'css-registry.js', 'dev.js']) assert.doesNotMatch(read(`packages/client/dist/${file}`), /from ['"](react|react-dom|next)[/'"]/, `client ${file} imports no framework`);
  for (const file of ['index.js', 'cache.js', 'routes.js', 'server.js', 'page.js', 'revalidate.js', 'handler.js']) assert.match(read(`packages/next/dist/${file}`), /import 'server-only';/, file);
});

test('one coordinated 0.x version, compatibility metadata, public npm metadata', () => {
  const versions = new Set(NAMES.map((n) => manifest(n).version));
  assert.equal(versions.size, 1);
  assert.match([...versions][0], /^0\.\d+\.\d+(-rc\.\d+)?$/);
  for (const name of NAMES) {
    const m = manifest(name);
    assert.equal(m.name, PACKAGES.find((p) => p.dir === name).name);
    const app = { plain: 2, blocksContract: 2, remoteConfig: 3, discovery: 1 };
    const compatibility = APP_PACKAGES.includes(name) ? app : (METADATA[name] ?? FORMATS);
    assert.deepEqual(m.foliwake, compatibility, name);
    const publicOnNpm = { access: 'public', provenance: true };
    assert.deepEqual(m.publishConfig, publicOnNpm, `${name}: public on npm, no custom registry`);
    assert.equal(m.private, undefined, `${name} must be publishable`);
    assertNpmMetadata(name, m);
    for (const [dep, spec] of Object.entries({ ...m.dependencies, ...m.devDependencies })) {
      assert.ok(spec === 'workspace:*' || /^\d+\.\d+\.\d+$/.test(spec), `${name}: ${dep}@${spec} must be pinned exactly`);
    }
  }
  assert.ok(!('@foliwake/server' in (manifest('react').dependencies ?? {})), '@foliwake/react never depends on the server package');
  const client = manifest('client');
  assert.deepEqual(Object.keys({ ...client.dependencies, ...client.peerDependencies }), ['@foliwake/blocks-contract'], '@foliwake/client depends on no framework');
  assert.equal(manifest('react').dependencies['@foliwake/client'], 'workspace:*');
});

function assertNpmMetadata(name, m) {
  assert.equal(m.license, 'Apache-2.0', name);
  const url = 'git+https://github.com/foliwake/foliwake-js.git';
  assert.deepEqual(m.repository, { type: 'git', url, directory: `packages/${name}` });
  assert.equal(m.homepage, `https://sdk.foliwake.dev/reference/packages/${name}`);
  assert.equal(m.bugs?.url, 'https://github.com/foliwake/foliwake-js/issues', name);
  assert.ok(m.keywords?.includes('foliwake'), `${name}: keywords`);
  assert.equal(m.engines?.node, '>=22.22', name);
  assert.ok(m.files.includes('CHANGELOG.md') && m.files.includes('LICENSE'), `${name}: files`);
}

test('tarballs: dist/ without maps or build stamps, plus LICENSE, README and CHANGELOG', async () => {
  for (const name of NAMES) {
    const { stdout } = await promisify(execFile)('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: path.join(ROOT, 'packages', name), maxBuffer: 16 << 20 });
    const files = JSON.parse(stdout)[0].files.map((f) => f.path);
    const always = ['LICENSE', 'README.md', 'CHANGELOG.md', 'package.json'];
    assert.ok(always.every((f) => files.includes(f)), `${name}: ${files.join(', ')}`);
    const unexpected = files.filter((f) => !always.includes(f) && !(f.startsWith('dist/') && /\.(js|d\.ts)$/.test(f)) && !((name === 'server' || name === 'next') && f.startsWith('schemas/')) && !(name === 'create-foliwake' && /^(starters|vendor)\//.test(f)) && !(name === 'block-kit' && f === 'dist/lit-html.LICENSE') && !(name === 'foliwake' && f === 'bin/foliwake.js'));
    assert.deepEqual(unexpected, [], name);
    const exported = Object.values(manifest(name).exports).flatMap((e) => (typeof e === 'string' ? [e] : Object.values(e))).map((p) => p.replace(/^\.\//, ''));
    for (const target of exported) if (target !== 'package.json') assert.ok(files.includes(target), `${name} exports ${target}`);
  }
});

test('@foliwake/next imports Next subpaths fully specified (Node ESM, vitest: next has no "exports" map)', () => {
  for (const file of ['index.js', 'cache.js', 'routes.js', 'server.js', 'page.js', 'config.js', 'settings.js', 'client.js']) {
    const text = read(`packages/next/dist/${file}`);
    for (const [, specifier] of text.matchAll(/from ['"](next\/[^'"]+)['"]/g)) assert.match(specifier, /\.js$/, `${file}: ${specifier}`);
  }
});
