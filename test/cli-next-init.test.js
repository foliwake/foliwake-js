// `foliwake next init` runs the wizard of @foliwake/next: the app's installed copy (here a link to the
// workspace package), with the same flags and exit codes as `npx @foliwake/next init`.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { runCli } from './helpers/cli.js';
import { CD, startStubOrigin } from './helpers/stub-origin.js';
import { discoveryDoc } from './fixtures/discovery.js';

const NEXT_PACKAGE = fileURLToPath(new URL('../packages/next', import.meta.url));

let site;
let dir;
before(async () => {
  site = await startStubOrigin({
    '/.well-known/foliwake.json': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(discoveryDoc({ site: 'demo', live: { url: site.origin }, preview: null, media: null })));
    },
    '/index.plain.html': { headers: { 'content-type': 'text/html', 'x-code-release': CD } },
  });
  dir = await mkdtemp(path.join(os.tmpdir(), 'fw-cli-next-'));
  const deps = { next: '16.2.12', '@foliwake/next': '0.9.0' };
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'app', dependencies: deps }));
  await writeFile(path.join(dir, 'tsconfig.json'), '{}');
  await mkdir(path.join(dir, 'app'));
  await mkdir(path.join(dir, 'node_modules/@foliwake'), { recursive: true });
  await symlink(NEXT_PACKAGE, path.join(dir, 'node_modules/@foliwake/next'), 'dir');
});
after(async () => {
  await site?.close();
  await rm(dir, { recursive: true, force: true });
});

test('foliwake next init runs the installed wizard with the flags given', async () => {
  const run = await runCli(['next', 'init', '--url', site.origin, '--yes', '--json'], { cwd: dir });
  assert.equal(run.code, 0, run.stderr);
  assert.equal(run.json.site, 'demo');
  assert.match(await readFile(path.join(dir, 'app/[...path]/page.tsx'), 'utf8'), /@foliwake\/next\/page/);
});

test('its exit codes are the wizard\'s: 2 when the URL is missing', async () => {
  const run = await runCli(['next', 'init', '--yes'], { cwd: dir });
  assert.equal(run.code, 2);
  assert.match(run.stderr, /--url https:\/\//);
});
