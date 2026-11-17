// The packed tarballs (the files the publish job uploads) installed into a throwaway consumer and used there:
// tools/check-package-tarballs.mjs, the same check the `pack` job runs before uploading them; and the hygiene
// rules of tools/package-tarball-hygiene.mjs on crafted file sets.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, test } from 'node:test';
import { fileProblems, privateNames, tarballProblems } from '../tools/package-tarball-hygiene.mjs';
import { PUBLISH_ORDER } from '../tools/packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = PUBLISH_ORDER;
const run = promisify(execFile);
let dir;
after(() => dir && rm(dir, { recursive: true, force: true }));

test('pnpm pack of every package, installed from the tarballs into a consumer and used there', async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'foliwake-tarballs-'));
  for (const name of NAMES) await run('pnpm', ['pack', '--pack-destination', dir], { cwd: path.join(ROOT, 'packages', name), maxBuffer: 16 << 20 });
  const files = (await readdir(dir)).sort();
  assert.equal(files.length, NAMES.length, files.join(', '));
  const { stdout } = await run(process.execPath, [path.join(ROOT, 'tools/check-package-tarballs.mjs'), dir], { maxBuffer: 16 << 20 });
  assert.match(stdout, /installed and used from/);
});

test('the check refuses a tarball set with a missing internal dependency', async () => {
  const partial = await mkdtemp(path.join(os.tmpdir(), 'foliwake-tarballs-partial-'));
  try {
    await run('pnpm', ['pack', '--pack-destination', partial], { cwd: path.join(ROOT, 'packages', 'server'), maxBuffer: 16 << 20 });
    const consumers = async () => (await readdir(os.tmpdir())).filter((f) => f.startsWith('foliwake-tarball-consumer-'));
    const before = new Set(await consumers());
    await assert.rejects(run(process.execPath, [path.join(ROOT, 'tools/check-package-tarballs.mjs'), partial]), (error) => error.code === 1 && /needs @foliwake\/blocks-contract/.test(error.stderr));
    assert.deepEqual((await consumers()).filter((f) => !before.has(f)), [], 'the consumer directory is removed after a failed check too');
  } finally {
    await rm(partial, { recursive: true, force: true });
  }
});

const clean = () => [
  { path: 'package.json', text: '{}' },
  { path: 'README.md', text: 'Docs: https://sdk.foliwake.dev/reference/packages/server, https://docs.foliwake.dev' },
  { path: 'CHANGELOG.md', text: '# Changelog' },
  { path: 'LICENSE', text: 'Apache License' },
  { path: 'dist/index.js', text: "if (host === '127.0.0.1') connect('https://foliwake.dev/schemas/x.json');" },
  { path: 'schemas/remote-2.schema.json', text: '{}' },
];
const problemsWith = (file) => tarballProblems([...clean(), file]);
const refused = (path, text, pattern) => assert.match(problemsWith({ path, text }).join('\n'), pattern);

test('hygiene: a clean file set passes', () => {
  assert.deepEqual(tarballProblems(clean()), []);
});

test('hygiene: files outside the whitelist and missing required files are refused', () => {
  refused('src/index.ts', '', /src\/index\.ts is outside the published whitelist/);
  refused('test/a.test.js', '', /outside the published whitelist/);
  const withoutChangelog = clean().filter((f) => f.path !== 'CHANGELOG.md');
  assert.match(tarballProblems(withoutChangelog).join(), /CHANGELOG\.md is missing/);
});

test('hygiene: credentials files and secrets in contents are refused', () => {
  refused('dist/.env', 'X=1', /looks like a credentials file/);
  refused('dist/key.pem', '', /looks like a credentials file/);
  const pem = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
  refused('dist/a.js', pem, /a PEM private key/);
  refused('dist/a.js', `t = "npm_${'a'.repeat(36)}"`, /an npm token/);
});

test('hygiene: local paths, internal hosts and source maps are refused', () => {
  refused('dist/a.js', 'from "/Users/someone/src/a.ts"', /local path \/Users\/someone\//);
  refused('dist/a.js', 'from "/home/ci/work/a.ts"', /local path/);
  refused('dist/a.js', 'https://internal.foliwake.dev/api', /internal host internal\.foliwake\.dev/);
  refused('README.md', 'ssh root@10.20.30.40', /internal host 10\.20\.30\.40/);
  refused('dist/a.js.map', '{}', /is a source map/);
  refused('dist/b.js', 'x\n//# sourceMappingURL=b.js.map', /has a sourceMappingURL/);
});

test('a private project name from FOLIWAKE_PRIVATE_NAMES fails the tarball, case-insensitive; none by default', () => {
  const file = { path: 'dist/index.js', text: 'export const site = "Secret-Client";' };
  const names = privateNames({ FOLIWAKE_PRIVATE_NAMES: ' secret-client , other ' });
  assert.deepEqual(names, ['secret-client', 'other']);
  assert.match(fileProblems(file, names).join(), /names a private project \(1 private name\(s\)\)/);
  assert.doesNotMatch(fileProblems(file, names).join(), /secret-client/i, 'the message never repeats the name');
  assert.deepEqual(fileProblems(file, privateNames({})), []);
});

test('hygiene: references to the private history of moved code are refused', () => {
  refused('dist/a.js', '// see docs/plan/17-site-blocks.md', /cites a private planning document/);
  refused('dist/a.js', '// (owner 2026-10-31: fewer moving parts)', /cites a dated owner decision/);
  refused('dist/a.js', '// RR-04: directories', /cites a review id \(RR-04\)/);
  refused('dist/a.js', '// P5-R07', /cites a review id/);
  refused('dist/a.js', '// as Codex suggested', /cites an agent name/);
  refused('README.md', 'Fixed after review of #117.', /cites a pull request number/);
  refused('dist/a.js', '// changed after some-site #15', /cites a pull request of another repository/);
  refused('dist/a.js', '// plan 17 §4.0', /cites a plan number/);
  assert.deepEqual(problemsWith({ path: 'dist/a.css.js', text: 'color: #18181b; /* the owner of a block */' }), []);
});
