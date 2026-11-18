#!/usr/bin/env node
// Installs the packed tarballs of this repository into a throwaway consumer project and uses them there, so the files
// the publish job uploads are the files that were checked (.github/workflows/publish.yml, `pack` job;
// test/packages-tarballs.test.js).
//
//   node tools/check-package-tarballs.mjs <dir with foliwake-<name>-<version>.tgz>
//
// The @foliwake packages come only from the tarballs (extracted into the consumer's node_modules). Third-party
// dependencies (htmlparser2, react, next, server-only) are linked from this repository's pinned install, so the
// check needs no network. Exits non-zero with a message on the first problem.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tarballProblems } from './package-tarball-hygiene.mjs';
import { PACKAGES, tarballName } from './packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!dir || !existsSync(dir)) {
  console.error('usage: node tools/check-package-tarballs.mjs <tarball directory>');
  process.exit(2);
}

// Thrown, not process.exit(): the consumer directory is removed in `finally` on every outcome.
class CheckFailure extends Error {}
const fail = (message) => {
  throw new CheckFailure(message);
};

const INTERNAL = new Set(PACKAGES.map((p) => p.name));
const TARBALL = /^[a-z][a-z-]*-\d+\.\d+\.\d+(-rc\.\d+)?\.tgz$/;
const tarballs = readdirSync(dir).filter((f) => TARBALL.test(f)).sort();
if (tarballs.length === 0) {
  console.error(`check-package-tarballs: no package tarball in ${dir}`);
  process.exit(1);
}

// The packed files as { path, text }, paths relative to `package/` (directory entries skipped).
function packedFiles(listing, root) {
  const paths = listing.filter((f) => !f.endsWith('/')).map((f) => f.slice('package/'.length));
  return paths.map((p) => ({ path: p, text: readFileSync(path.join(root, p), 'utf8') }));
}

const consumer = mkdtempSync(path.join(os.tmpdir(), 'foliwake-tarball-consumer-'));
try {
  const modules = path.join(consumer, 'node_modules');
  const manifests = new Map();
  for (const file of tarballs) {
    const listing = execFileSync('tar', ['-tzf', path.join(dir, file)], { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (listing.some((f) => !f.startsWith('package/'))) fail(`${file}: entries outside package/`);
    const staging = mkdtempSync(path.join(consumer, 'x-'));
    execFileSync('tar', ['-xzf', path.join(dir, file), '-C', staging]);
    const manifest = JSON.parse(readFileSync(path.join(staging, 'package', 'package.json'), 'utf8'));
    if (!INTERNAL.has(manifest.name)) fail(`${file}: package name ${manifest.name}`);
    if (file !== tarballName(manifest.name, manifest.version)) fail(`${file}: holds ${manifest.name}@${manifest.version}`);
    const target = path.join(modules, manifest.name);
    mkdirSync(path.dirname(target), { recursive: true });
    execFileSync('mv', [path.join(staging, 'package'), target]);
    // Whitelist, secrets, local paths, internal hosts, source maps (tools/package-tarball-hygiene.mjs).
    const problems = tarballProblems(packedFiles(listing, target));
    if (problems.length) fail(`${file}:\n  ${problems.join('\n  ')}`);
    rmSync(staging, { recursive: true, force: true });
    manifests.set(manifest.name, manifest);
  }

  // Internal dependencies: exact, published together, never `workspace:`.
  const versions = new Set([...manifests.values()].map((m) => m.version));
  if (versions.size !== 1) fail(`one version for all packages, found ${[...versions].join(', ')}`);
  const [version] = versions;
  const external = new Map();
  for (const [name, manifest] of manifests) {
    const short = PACKAGES.find((p) => p.name === name).dir;
    for (const [dep, range] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      if (String(range).startsWith('workspace:')) fail(`${name}: ${dep} is still ${range}`);
      if (INTERNAL.has(dep)) {
        if (range !== version) fail(`${name}: ${dep} is ${range}, not ${version}`);
        if (!manifests.has(dep)) fail(`${name} needs ${dep}, which is not among the tarballs`);
      } else if (!external.has(dep)) {
        const candidates = [path.join(ROOT, 'packages', short, 'node_modules', dep), path.join(ROOT, 'node_modules', dep)];
        const found = candidates.find((c) => existsSync(c));
        if (!found) fail(`${name}: ${dep} is not installed in this repository`);
        external.set(dep, realpathSync(found));
      }
    }
  }
  if (external.has('next') && !external.has('react-dom')) external.set('react-dom', realpathSync(path.join(path.dirname(external.get('next')), 'react-dom')));
  for (const [dep, real] of external) {
    const link = path.join(modules, dep);
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync(real, link, 'dir');
  }
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'tarball-consumer', private: true, type: 'module' }));

  // Use the packages from the consumer: every JS export resolves inside node_modules/@foliwake, and those that
  // run outside a framework's server runtime are imported and exercised.
  const smoke = `
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const manifests = ${JSON.stringify(Object.fromEntries([...manifests].map(([n, m]) => [n, Object.keys(m.exports ?? {})])))};
const consumer = ${JSON.stringify(realpathSync(consumer))};
for (const [name, subpaths] of Object.entries(manifests)) {
  for (const sub of subpaths) {
    if (sub === './package.json') continue;
    const file = fileURLToPath(import.meta.resolve(name + sub.slice(1)));
    assert.ok(file.startsWith(consumer + '/node_modules/' + name + '/'), name + sub + ' resolves to ' + file);
    assert.ok(existsSync(file), name + sub + ': ' + file);
  }
}
const has = (name) => name in manifests;
if (has('@foliwake/blocks-contract')) await import('@foliwake/blocks-contract/page');
if (has('@foliwake/core-contract')) {
  const contract = await import('@foliwake/core-contract');
  assert.equal(contract.procedureType('sites.status'), 'query');
  assert.match(contract.CONTRACT_DIGEST, /^[0-9a-f]{16}$/);
}
if (has('@foliwake/server')) {
  const { parseFoliwakeConfig } = await import('@foliwake/server/config');
  const { preparePage } = await import('@foliwake/server/page');
  const { checkPlainBody } = await import('@foliwake/server/html');
  await import('@foliwake/server/handlers');
  await import('@foliwake/server/csp');
  const config = parseFoliwakeConfig(JSON.stringify({ version: 2, site: 'demo', live: { url: 'https://origin.example', auth: { type: 'basic', username: 'app', passwordEnv: 'X' } }, app: { pages: ['/**'], blocks: { entry: 'scripts/blocks.js', eventPrefix: 'demo' } } }));
  const cd = 'cd_' + 'a1'.repeat(16);
  const page = preparePage(config, { site: 'demo', channel: 'live', path: '/a', html: '<h1>A</h1><div data-component="quiz"><p>Q</p></div>', codeRelease: cd, htmlContract: '2', lang: 'en', pageId: null, etag: null, generation: null });
  assert.deepEqual(page.blocks, ['quiz']);
  assert.match(page.identity, /^demo\\|live\\|\\/a\\|/);
  assert.throws(() => checkPlainBody('<script>x()</script>', '/a'));
}
if (has('@foliwake/site-check')) {
  const { checkCodeRelease } = await import('@foliwake/site-check');
  const { parseAccessConfig } = await import('@foliwake/site-check/formats/access');
  const bytes = (text) => new TextEncoder().encode(text);
  const files = new Map([
    ['scripts/components.js', bytes("import '@foliwake/block-kit';")],
    ['styles/styles.css', bytes('')],
    ['components/note/note.json', bytes('{"fields": [{"name": "text", "type": "text"}]}')],
    ['components/note/note.css', bytes('')],
  ]);
  const result = await checkCodeRelease(files);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(parseAccessConfig(bytes('version: 1\\nallow: ["/"]\\n')).config);
  const { execFileSync } = await import('node:child_process');
  const bin = fileURLToPath(new URL('dist/bin.js', import.meta.resolve('@foliwake/site-check/package.json')));
  assert.match(execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf8' }), /^0\./);
}
if (has('create-foliwake')) {
  const { projectFiles, projectProblems } = await import('create-foliwake');
  const files = await projectFiles({ template: 'examples', target: '/tmp/x-site', siteId: null, react: true });
  assert.ok(files.some((file) => file.path === 'scripts/vendor/react.js'), 'the vendored React ships');
  assert.deepEqual(await projectProblems(files), []);
  const { execFileSync } = await import('node:child_process');
  const bin = fileURLToPath(new URL('dist/bin.js', import.meta.resolve('create-foliwake/package.json')));
  assert.match(execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf8' }), /^0\./);
}
if (has('@foliwake/client')) {
  const client = await import('@foliwake/client');
  assert.equal(typeof client.mountFoliwakePage, 'function');
}
if (has('@foliwake/react')) {
  const react = await import('@foliwake/react');
  assert.equal(typeof react.FoliwakePage, 'function');
}
if (has('@foliwake/next')) {
  const nextClient = await import('@foliwake/next/client');
  assert.equal(typeof nextClient.FoliwakePage, 'function');
  const { withFoliwake } = await import('@foliwake/next/config');
  assert.equal(typeof withFoliwake, 'function');
}
console.log('ok');
`;
  writeFileSync(path.join(consumer, 'smoke.mjs'), smoke);
  try {
    const out = execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    if (out.trim() !== 'ok') fail(`unexpected smoke output: ${out}`);
  } catch (error) {
    fail(`using the tarballs failed:\n${error.stderr || error.stdout || error.message}`);
  }
  console.log(`check-package-tarballs: ${tarballs.join(', ')} installed and used from ${consumer}`);
} catch (error) {
  console.error(`check-package-tarballs: ${error instanceof CheckFailure ? error.message : error?.stack ?? error}`);
  process.exitCode = 1;
} finally {
  if (!process.env.FOLIWAKE_KEEP_CONSUMER) rmSync(consumer, { recursive: true, force: true });
}
