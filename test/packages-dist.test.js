// The built packages: directives and import comments survive the build; tarballs hold only what ships;
// one shared version and the compatibility metadata.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['blocks-contract', 'server', 'client', 'react', 'next'];
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const manifest = (name) => JSON.parse(read(`packages/${name}/package.json`));

test("'use client', 'use cache' and the runtime import comments are kept in dist/", () => {
  assert.match(read('packages/react/dist/index.js'), /^'use client';/);
  assert.match(read('packages/next/dist/client.js'), /^'use client';/);
  assert.match(read('packages/client/dist/load.js'), /import\(\/\* webpackIgnore: true \*\/ \/\* turbopackIgnore: true \*\/ \/\* @vite-ignore \*\/ url\)/);
  assert.match(read('packages/next/dist/cache.js'), /async function readEnvelopeCachedEntry\(path\) \{\s+'use cache';/);
  assert.doesNotMatch(read('packages/react/dist/foliwake-page.js'), /import\(/, 'the React wrapper imports no blocks module itself');
  for (const file of ['index.js', 'mount.js', 'events.js', 'host.js', 'load.js', 'import-map.js', 'css-registry.js', 'dev.js']) assert.doesNotMatch(read(`packages/client/dist/${file}`), /from ['"](react|react-dom|next)[/'"]/, `client ${file} imports no framework`);
  for (const file of ['index.js', 'cache.js', 'routes.js', 'server.js', 'page.js']) assert.match(read(`packages/next/dist/${file}`), /import 'server-only';/, file);
});

test('one coordinated 0.x version, compatibility metadata, public npm metadata', () => {
  const versions = new Set(NAMES.map((n) => manifest(n).version));
  assert.equal(versions.size, 1);
  assert.match([...versions][0], /^0\.\d+\.\d+$/);
  for (const name of NAMES) {
    const m = manifest(name);
    assert.equal(m.name, `@foliwake/${name}`);
    assert.deepEqual(m.foliwake, { plain: 2, blocksContract: 2, remoteConfig: 2 }, name);
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
  assert.equal(m.homepage, `https://docs.foliwake.dev/reference/packages/${name}`);
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
    const unexpected = files.filter((f) => !always.includes(f) && !(f.startsWith('dist/') && /\.(js|d\.ts)$/.test(f)) && !(name === 'server' && f.startsWith('schemas/')));
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
