// @foliwake/cli: server addresses, which server a command calls, sign-ins kept as the engine's CLI keeps them,
// and login, whoami and logout against a fake server driven by the contract's manifest.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { credentialStore } from '../packages/cli/dist/remote/credentials.js';
import { waitForSignIn } from '../packages/cli/dist/remote/device-login.js';
import { readProfiles, resolveTarget, serverOrigin, writeProfiles } from '../packages/cli/dist/remote/servers.js';
import { forgetSignIn, saveSignIn, tokenFor } from '../packages/cli/dist/remote/session.js';
import { waitInSlices } from '../packages/cli/dist/remote/wait-slices.js';

import { cliHome, runCli } from './helpers/cli.js';
import { FAKE_TOKEN, failure, startFakeCoreServer } from './helpers/fake-core-server.js';

const GRANT = { principal: 'operator:admin', installation: true, memberships: [] };

describe('server addresses', () => {
  test('a host means https; an origin is kept; http only for loopback', () => {
    assert.equal(serverOrigin('foliwake.dev'), 'https://foliwake.dev');
    assert.equal(serverOrigin('https://Foliwake.example:8443/'), 'https://foliwake.example:8443');
    assert.equal(serverOrigin('http://127.0.0.1:8098'), 'http://127.0.0.1:8098');
    assert.equal(serverOrigin('cloud', {}), 'https://foliwake.dev');
    assert.throws(() => serverOrigin('http://foliwake.example'), /loopback/);
    assert.throws(() => serverOrigin('https://foliwake.example/api'), /origin only/);
    assert.throws(() => serverOrigin('https://user:pw@foliwake.example'), /origin only/);
    assert.throws(() => serverOrigin('ftp://foliwake.example'), /https/);
  });
});

describe('which server a command calls', () => {
  let home;
  before(async () => {
    home = await cliHome();
  });
  after(() => home.cleanup());

  const link = async (server) => {
    await mkdir(path.join(home.cwd, '.foliwake'), { recursive: true });
    const connection = { server, site: 'my-site', org: 'acme-org' };
    await writeFile(path.join(home.cwd, '.foliwake', 'connection.json'), JSON.stringify(connection));
  };

  test('--server, then .foliwake/connection.json, then FOLIWAKE_SERVER, then the last login; else none', async () => {
    const { env, cwd } = home;
    assert.equal(resolveTarget({}, env, cwd), null);
    writeProfiles({ default: 'https://default.example', servers: {}, signedOut: [] }, env);
    assert.deepEqual(resolveTarget({}, env, cwd), { origin: 'https://default.example', from: 'login' });
    const withEnv = { ...env, FOLIWAKE_SERVER: 'env.example' };
    assert.deepEqual(resolveTarget({}, withEnv, cwd), { origin: 'https://env.example', from: 'environment' });
    await link('https://linked.example');
    assert.deepEqual(resolveTarget({}, withEnv, cwd), { origin: 'https://linked.example', from: 'connection' });
    const flag = resolveTarget({ server: 'flag.example' }, withEnv, cwd);
    assert.deepEqual(flag, { origin: 'https://flag.example', from: 'flag' });
  });

  test('FOLIWAKE_CONFIG never makes a command local: FOLIWAKE_SERVER still names the server', () => {
    const env = { ...home.env, FOLIWAKE_SERVER: 'env.example', FOLIWAKE_CONFIG: 'foliwake.config.json' };
    assert.deepEqual(resolveTarget({}, env, home.root + '/elsewhere'), { origin: 'https://env.example', from: 'environment' });
  });
});

describe('sign-ins, kept as the engine CLI keeps them', () => {
  let home;
  before(async () => {
    home = await cliHome();
  });
  after(() => home.cleanup());

  test('a file sign-in: 0600, the profile holds no token, FOLIWAKE_TOKEN wins, forgetting moves the default', async () => {
    const { env, root } = home;
    const token = `fwk_${randomBytes(8).toString('hex')}`;
    const save = (origin, value) => saveSignIn({ origin, token: value, grant: GRANT, store: credentialStore('file', env) }, env);
    assert.equal(save('https://a.example', `${token}old`), null);
    assert.equal(save('https://a.example', token), `${token}old`, 'a new sign-in returns the token it replaced');
    save('https://b.example', `${token}b`);
    const credentials = path.join(root, 'config', 'credentials.json');
    assert.equal((await stat(credentials)).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(JSON.parse(await readFile(credentials, 'utf8'))).sort(), ['https://a.example', 'https://b.example']);
    const profiles = readProfiles(env);
    assert.equal(profiles.default, 'https://b.example');
    assert.equal(profiles.servers['https://a.example'].store, 'file');
    assert.equal(profiles.servers['https://a.example'].origin, 'https://a.example');
    assert.doesNotMatch(JSON.stringify(profiles), new RegExp(token));
    assert.equal(tokenFor('https://a.example', env), token);
    const ci = { ...env, FOLIWAKE_TOKEN: 'fwk_ci', FOLIWAKE_SERVER: 'a.example' };
    assert.equal(tokenFor('https://a.example', { ...env, FOLIWAKE_TOKEN: 'fwk_ci' }), token, 'no FOLIWAKE_SERVER');
    assert.equal(tokenFor('https://a.example', ci), 'fwk_ci');
    assert.equal(tokenFor('https://c.example', ci), null, 'another server gets nothing');
    assert.equal(forgetSignIn('https://b.example', env), true);
    assert.equal(readProfiles(env).default, 'https://a.example');
    assert.equal(tokenFor('https://b.example', env), null);
  });
});

// Only an entry of a test-only service, removed afterwards; the person's own entries are never read.
describe('macOS Keychain', { skip: process.platform !== 'darwin' && 'macOS only' }, () => {
  const env = { FOLIWAKE_KEYCHAIN_SERVICE: `foliwake-test-${randomBytes(6).toString('hex')}` };
  const key = 'https://keychain-test.invalid';
  after(() => credentialStore('keychain', env).delete(key));

  test('stores, reads back, replaces and deletes a token', () => {
    const store = credentialStore('keychain', env);
    assert.equal(store.get(key), null);
    store.set(key, 'fwk_first');
    assert.equal(store.get(key), 'fwk_first');
    store.set(key, 'fwk_second');
    assert.equal(store.get(key), 'fwk_second');
    store.delete(key);
    assert.equal(store.get(key), null);
  });
});

describe('polling the token endpoint', () => {
  test('transient failures back off and polling goes on; the token arrives', async () => {
    const answers = [[503, {}], [502, {}], [400, { error: 'authorization_pending' }], [200, { access_token: 'fwk_ok' }]];
    const server = createServer((req, res) => {
      const [status, body] = answers.shift();
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const waits = [];
    try {
      const start = { deviceCode: 'd', intervalS: 1, expiresInS: 600 };
      const { token } = await waitForSignIn(origin, start, { sleep: async (ms) => void waits.push(ms) });
      assert.equal(token, 'fwk_ok');
      assert.deepEqual(waits, [1000, 2000, 4000, 1000], 'doubled after each transient failure, then the interval');
    } finally {
      server.close();
    }
  });

  test('an unreachable server is waited out until the code expires', async () => {
    let clock = 0;
    const waits = [];
    const sleep = async (ms) => {
      waits.push(ms);
      clock += ms;
    };
    const start = { deviceCode: 'd', intervalS: 5, expiresInS: 300 };
    const error = await waitForSignIn('http://127.0.0.1:9', start, { now: () => clock, sleep }).catch((e) => e);
    assert.equal(error.code, 'SIGN_IN_EXPIRED');
    assert.deepEqual(waits.slice(0, 4), [5000, 10000, 20000, 40000]);
    assert.ok(waits.every((ms) => ms <= 60000));
  });
});

describe('waiting on a server in slices', () => {
  const op = (state, delivery) => ({ site: 's', id: 'op_1', state, ...(delivery ? { delivery } : {}) });

  test('stops as the server does: a pending refresh with a reason is reached, after one request', async () => {
    let calls = 0;
    const reason = 'refresh failed; operation recover';
    const wait = async () => (calls++, op('succeeded', { state: 'pending', reason }));
    const answer = await waitInSlices(wait, { until: 'delivery', timeoutMs: 600_000, sliceMs: 25_000 });
    assert.equal(calls, 1);
    assert.equal(answer.delivery.reason, reason);
  });

  test('asks again while not reached, until reached or the time is up', async () => {
    const answers = [op('running'), op('succeeded', { state: 'pending' }), op('succeeded', { state: 'done' })];
    const slices = [];
    let clock = 0;
    const now = () => clock;
    const wait = async (ms) => (slices.push(ms), (clock += ms), answers.shift());
    const done = await waitInSlices(wait, { until: 'delivery', timeoutMs: 100_000, sliceMs: 25_000, now });
    assert.equal(done.delivery.state, 'done');
    assert.deepEqual(slices, [25_000, 25_000, 25_000]);
    clock = 0;
    const running = async (ms) => ((clock += ms), op('running'));
    const timedOut = await waitInSlices(running, { until: 'commit', timeoutMs: 60_000, sliceMs: 25_000, now });
    assert.equal(timedOut.state, 'running');
    assert.equal(clock, 60_000, 'the last slice is what is left');
  });
});

describe('login, whoami and logout against a fake server', () => {
  let fake;
  let home;
  before(async () => {
    fake = await startFakeCoreServer();
    home = await cliHome();
  });
  after(async () => {
    await fake.close();
    await home.cleanup();
  });

  test('login --no-browser prints the code, keeps the token and makes the server the default', async () => {
    const run = await runCli(['login', fake.origin, '--no-browser', '--insecure-storage', '--json'], home);
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stderr, /Your one-time code: ABCD-EFGH/);
    assert.match(run.stderr, new RegExp(`Approve it at ${fake.origin}/device\\?code=ABCD-EFGH`));
    assert.equal(run.json.server, fake.origin);
    assert.equal(run.json.store, 'file');
    assert.doesNotMatch(run.stdout + run.stderr, new RegExp(FAKE_TOKEN), 'the token is never printed');
    const started = fake.requests.find((r) => r.path === '/api/auth/device/code');
    assert.match(started.input.client, /^@foliwake\/cli\/0\.\d+\.\d+/);
    assert.equal(readProfiles(home.env).default, fake.origin);
  });

  test('whoami --json: the last login, the token sent, the client named in X-Foliwake-Cli', async () => {
    const run = await runCli(['whoami', '--json'], home);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.json.server, fake.origin);
    assert.equal(run.json.principal, 'account:acc_owner');
    const [call] = fake.rpcCalls('whoami').slice(-1);
    assert.equal(call.method, 'GET');
    assert.equal(call.headers.authorization, `Bearer ${FAKE_TOKEN}`);
    assert.match(call.headers['x-foliwake-cli'], /^@foliwake\/cli\/0\./);
    const text = await runCli(['--debug', 'whoami'], home);
    assert.match(text.stdout, new RegExp(`^Server {9}${fake.origin}\\nPrincipal {6}account:acc_owner\\n`));
    assert.match(text.stdout, /Organisations {2}acme-org \(admin, live\)/);
  });

  test('a core error: the same text and JSON as the engine CLI, exit 1', async () => {
    fake.handlers.whoami = () => {
      throw failure('TOKEN_INVALID', 'unauthorized', 'The sign-in token is not valid.', 401);
    };
    const run = await runCli(['whoami'], home);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /TOKEN_INVALID: The sign-in token is not valid\./);
    assert.match(run.stderr, new RegExp(`Sign in with \`foliwake login ${fake.origin}\``));
    const json = await runCli(['whoami', '--json'], home);
    assert.equal(json.json.error.code, 'TOKEN_INVALID');
    delete fake.handlers.whoami;
  });

  test('FOLIWAKE_TOKEN with FOLIWAKE_SERVER (CI): no sign-in on this computer needed', async () => {
    const ci = await cliHome();
    try {
      const env = { ...ci.env, FOLIWAKE_SERVER: fake.origin, FOLIWAKE_TOKEN: FAKE_TOKEN };
      const run = await runCli(['whoami', '--json'], { env, cwd: ci.cwd });
      assert.equal(run.code, 0, run.stderr);
      const config = { ...env, FOLIWAKE_CONFIG: 'foliwake.config.json' };
      const withConfig = await runCli(['whoami', '--json'], { env: config, cwd: ci.cwd });
      assert.equal(withConfig.code, 0, 'FOLIWAKE_CONFIG does not turn FOLIWAKE_SERVER off');
      assert.equal(withConfig.json.server, fake.origin);
    } finally {
      await ci.cleanup();
    }
  });

  test('logout revokes the token on the server and forgets it here', async () => {
    const run = await runCli(['logout', '--json'], home);
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(run.json, { server: fake.origin, revoked: true });
    assert.equal(fake.requests.at(-1).path, '/api/auth/logout');
    assert.equal(readProfiles(home.env).default, null);
    const none = await runCli(['whoami'], home);
    assert.equal(none.code, 2);
    assert.match(none.stderr, /No Foliwake server is named/);
  });
});
