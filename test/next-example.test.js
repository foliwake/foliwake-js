// examples/next-minimal: its Foliwake files are what `init` writes (always checked); with FOLIWAKE_NEXT_SMOKE=1 it
// is built with `next build` against a stub site and started, and a site page, a code file and the health route
// are requested from it (slow: about a minute; run before a merge, not on every push).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { runInit } from '../packages/next/dist/init/run.js';
import { CD, startStubOrigin } from './helpers/stub-origin.js';
import { discoveryDoc } from './fixtures/discovery.js';

const EXAMPLE = fileURLToPath(new URL('../examples/next-minimal', import.meta.url));
const NEXT_BIN = path.join(EXAMPLE, 'node_modules/next/dist/bin/next');
const BLOCKS = 'entry="scripts/blocks.js", contract=2, prefix="demo"';
const BODY = '<h1>Light signals</h1><div data-component="question"><p>Which light?</p></div>';
const SMOKE = process.env.FOLIWAKE_NEXT_SMOKE === '1';

let site;
before(async () => {
  const plain = { 'content-type': 'text/html; charset=utf-8', 'x-code-release': CD, 'x-html-contract': '2' };
  site = await startStubOrigin({
    '/.well-known/foliwake.json': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(discoveryDoc({ site: 'demo', live: { url: site.origin }, preview: null, media: null })));
    },
    '/index.plain.html': { headers: { ...plain, 'x-foliwake-blocks': BLOCKS }, body: '<p>Home</p>' },
    '/lessons/a.plain.html': { headers: { ...plain, 'x-foliwake-blocks': BLOCKS }, body: BODY },
    [`/code/${CD}/scripts/blocks.js`]: { headers: { 'content-type': 'text/javascript' }, body: 'export {};' },
    [`/code/${CD}/components/components.json`]: { headers: { 'content-type': 'application/json' }, body: '{}' },
  });
});
after(() => site?.close());

test('the example is what init writes (a dry run changes nothing but .env.local)', async () => {
  let stdout = '';
  const io = { stdout: (t) => (stdout += t), stderr: () => {}, env: {}, cwd: EXAMPLE };
  const code = await runInit(['init', '--url', site.origin, '--yes', '--dry-run', '--json'], io);
  assert.equal(code, 0);
  const steps = JSON.parse(stdout).steps.filter((step) => step.path !== '.env.local');
  assert.deepEqual(
    steps.map((step) => [step.path, step.outcome]),
    [
      ['next.config.ts', 'exists'],
      ['app/foliwake/[...path]/route.ts', 'exists'],
      ['app/[...path]/page.tsx', 'exists'],
    ],
  );
});

async function freePort() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  return port;
}

/** Runs `next <args>` in the example; resolves with its output when it exits with 0. */
function next(args, env) {
  const child = spawn(process.execPath, [NEXT_BIN, ...args], { cwd: EXAMPLE, env: { ...process.env, ...env } });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  return { child, output: () => output };
}

async function waitForServer(url, run) {
  for (let i = 0; i < 100; i += 1) {
    try {
      return await fetch(url);
    } catch {
      if (run.child.exitCode !== null) throw new Error(`next start exited:\n${run.output()}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`next start did not answer:\n${run.output()}`);
}

describe('next build and start against a stub site', { skip: !SMOKE && 'set FOLIWAKE_NEXT_SMOKE=1' }, () => {
  let server;
  let origin;
  before(async () => {
    const env = { FOLIWAKE_URL: site.origin, NEXT_TELEMETRY_DISABLED: '1' };
    const build = next(['build'], env);
    const [code] = await once(build.child, 'exit');
    assert.equal(code, 0, build.output());
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    server = next(['start', '--port', String(port), '--hostname', '127.0.0.1'], env);
    await waitForServer(`${origin}/foliwake/health`, server);
  });
  after(async () => {
    server?.child.kill('SIGTERM'); // only this test's own process
    await rm(path.join(EXAMPLE, '.next'), { recursive: true, force: true });
  });

  test('a site page renders inside the app, with its title and the blocks module of its release', async () => {
    const response = await fetch(`${origin}/lessons/a`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<h1>Light signals<\/h1>/);
    assert.match(html, /<title>Light signals<\/title>/);
    assert.ok(html.includes(`/foliwake/code/${CD}/scripts/blocks.js`), 'the release names the blocks module');
    assert.match(html, /<a href="\/">My app<\/a>/, "inside the app's layout");
  });

  test('the route serves code and health; the app keeps its own /', async () => {
    const code = await fetch(`${origin}/foliwake/code/${CD}/scripts/blocks.js`);
    assert.equal(code.status, 200);
    assert.equal(await code.text(), 'export {};');
    assert.deepEqual(await (await fetch(`${origin}/foliwake/health`)).json(), { ok: true, site: 'demo' });
    assert.match(await (await fetch(`${origin}/`)).text(), /This page is the app/);
  });

  test('a missing page is not found', async () => {
    const response = await fetch(`${origin}/lessons/missing`);
    assert.match(await response.text(), /404|could not be found/i);
  });
});
