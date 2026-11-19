// @foliwake/next/handler: the one route file of a Next app, run outside Next with plain Requests (in a child
// process with the react-server condition, as Next resolves server-only modules).
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { CD, startStubOrigin } from './helpers/stub-origin.js';

const RUN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/next-handler-run.mjs');
const APP = 'https://app.example';

let stub;
before(async () => {
  stub = await startStubOrigin({
    [`/code/${CD}/scripts/blocks.js`]: { headers: { 'content-type': 'text/javascript' }, body: 'export {};' },
  });
});
after(() => stub?.close());

function config() {
  return JSON.stringify({
    version: 2,
    site: 'demo',
    live: { url: stub.origin },
    preview: { url: stub.origin },
    app: { pages: ['/**'], proxies: { code: '/foliwake/code', media: '/foliwake/media' } },
  });
}

async function run(requests) {
  const env = {
    ...process.env,
    FOLIWAKE_APP_CONFIG: JSON.stringify({ file: 'foliwake.remote.json', text: config() }),
    FOLIWAKE_HOOK_SECRET: 'h'.repeat(40),
  };
  const args = ['--conditions=react-server', RUN, JSON.stringify(requests)];
  // Not execFileSync: the stub origin answers from this process's event loop.
  const { stdout } = await promisify(execFile)(process.execPath, args, { env, encoding: 'utf8' });
  return JSON.parse(stdout);
}

test('the default exports route code, health and hook; preview is off', async () => {
  const [code, health, preview, hook, other] = await run([
    { method: 'GET', url: `${APP}/foliwake/code/${CD}/scripts/blocks.js` },
    { method: 'GET', url: `${APP}/foliwake/health` },
    { method: 'GET', url: `${APP}/foliwake/code/preview/${CD}/scripts/blocks.js` },
    { method: 'POST', url: `${APP}/foliwake/hook` },
    { method: 'GET', url: `${APP}/foliwake/nothing` },
  ]);
  assert.deepEqual([code.status, code.text], [200, 'export {};']);
  assert.deepEqual(JSON.parse(health.text), { ok: true, site: 'demo' });
  assert.deepEqual([preview.status, preview.cacheControl], [404, 'private, no-store']);
  assert.equal(hook.status, 401, 'the Next hook endpoint checks the signature');
  assert.equal(other.status, 404);
});

test('createFoliwakeHandler: hook false is 404, an author check opens preview', async () => {
  const [hook, preview] = await run([
    { method: 'POST', url: `${APP}/foliwake/hook`, custom: true },
    { method: 'GET', url: `${APP}/foliwake/code/preview/${CD}/scripts/blocks.js`, custom: true },
  ]);
  assert.equal(hook.status, 404);
  assert.equal(preview.status, 200);
  assert.equal(preview.cacheControl, 'private, no-store');
});
