// @foliwake/cli as the engine's oclif plugin: with a local runtime registered (@foliwake/cli/local-runtime), the
// same commands run on this computer when the engine's server order says so, and `dev` serves local content.
// The engine is a fake here (fixtures/engine-cli.mjs): it records its local calls on stderr.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as answers from './fixtures/cli-answers.js';
import { cliHome, runCli } from './helpers/cli.js';
import { FAKE_TOKEN, startFakeCoreServer } from './helpers/fake-core-server.js';

const ENGINE_BIN = fileURLToPath(new URL('./fixtures/engine-cli.mjs', import.meta.url));

/** oclif wraps its error lines to the terminal width; one line each. */
const unwrapped = (stderr) => stderr.replace(/\s*\n\s*(›\s*)?/g, ' ');

const localCalls = (stderr) => stderr.split('\n').filter((line) => line.startsWith('local: '));

describe('with the engine registered', () => {
  let fake;
  let home;
  before(async () => {
    fake = await startFakeCoreServer({
      handlers: { 'sites.list': () => answers.sitesList, 'sites.status': () => answers.siteStatus },
    });
    home = await cliHome();
  });
  after(async () => {
    await fake.close();
    await home.cleanup();
  });
  const engine = (args, { env = {}, cwd = home.cwd } = {}) =>
    runCli(args, { env: { ...home.env, ...env }, cwd, bin: ENGINE_BIN });
  const server = { FOLIWAKE_SERVER: '', FOLIWAKE_TOKEN: FAKE_TOKEN };

  test('--config runs the command locally: the same text, the configuration passed to the runtime', async () => {
    const run = await engine(['site', 'status', '--config', 'site.json']);
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /^Site {7}my-site$/m);
    const calls = localCalls(run.stderr);
    assert.ok(calls.includes('local: traced site.status'), run.stderr);
    assert.ok(calls.some((line) => line.startsWith('local: open {"config":"site.json"')), run.stderr);
    assert.ok(calls.includes('local: sites.status {"site":"my-site"}'), run.stderr);
    assert.equal(calls.at(-1), 'local: close');
  });

  test('server order: FOLIWAKE_SERVER before ./foliwake.config.json; the folder config before nothing', async () => {
    const folder = path.join(home.root, 'project');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'foliwake.config.json'), '{}');
    const remote = await engine(['site', 'status'], { cwd: folder, env: { ...server, FOLIWAKE_SERVER: fake.origin } });
    assert.equal(remote.code, 0, remote.stderr);
    assert.deepEqual(localCalls(remote.stderr), ['local: traced site.status']);
    assert.equal(fake.rpcCalls('sites.status').length, 1);
    const local = await engine(['site', 'status'], { cwd: folder });
    assert.equal(local.code, 0, local.stderr);
    assert.ok(localCalls(local.stderr).includes('local: sites.status {"site":"my-site"}'), local.stderr);
  });

  test('an explicit FOLIWAKE_SERVER wins over FOLIWAKE_CONFIG; FOLIWAKE_CONFIG alone runs locally', async () => {
    const env = { ...server, FOLIWAKE_SERVER: fake.origin, FOLIWAKE_CONFIG: '/data/foliwake.config.json' };
    const before = fake.rpcCalls('sites.status').length;
    const remote = await engine(['site', 'status'], { env });
    assert.equal(remote.code, 0, remote.stderr);
    assert.equal(fake.rpcCalls('sites.status').length, before + 1, remote.stderr);
    assert.deepEqual(localCalls(remote.stderr), ['local: traced site.status']);
    const local = await engine(['site', 'status'], { env: { FOLIWAKE_CONFIG: 'site.json' } });
    assert.equal(local.code, 0, local.stderr);
    assert.ok(localCalls(local.stderr).includes('local: sites.status {"site":"my-site"}'), local.stderr);
    const flag = await engine(['site', 'status', '--config', 'site.json'], { env });
    assert.ok(localCalls(flag.stderr).includes('local: sites.status {"site":"my-site"}'), 'a flag wins over both');
  });

  test("the folder's .foliwake/connection.json comes before FOLIWAKE_SERVER and the folder config", async () => {
    const folder = path.join(home.root, 'linked');
    await mkdir(path.join(folder, '.foliwake'), { recursive: true });
    await writeFile(path.join(folder, 'foliwake.config.json'), '{}');
    const connection = { server: fake.origin, site: 'my-site', org: 'acme-org' };
    await writeFile(path.join(folder, '.foliwake', 'connection.json'), JSON.stringify(connection));
    const env = { FOLIWAKE_SERVER: 'https://elsewhere.example', FOLIWAKE_TOKEN: FAKE_TOKEN };
    const before = fake.rpcCalls('sites.status').length;
    const run = await engine(['site', 'status'], { cwd: folder, env });
    // FOLIWAKE_TOKEN is only for FOLIWAKE_SERVER: unauthorised here, but the call went to the linked server.
    assert.equal(fake.rpcCalls('sites.status').length, before + 1, run.stderr);
    assert.ok(!localCalls(run.stderr).some((line) => line.includes('sites.status')), run.stderr);
  });

  test('--server with --config, or --content with a server, exit 2', async () => {
    const both = await engine(['site', 'status', '--server', fake.origin, '--config', 'x.json']);
    assert.equal(both.code, 2);
    assert.match(both.stderr, /Use either --server or --config, not both\./);
    const content = await engine(['page', 'check', '--server', fake.origin, '--content', '.']);
    assert.equal(content.code, 2);
    const refused = /--content reads a folder on this computer; it does not apply to a server\./;
    assert.match(unwrapped(content.stderr), refused);
  });

  test('whoami locally: no server; recover --break-lock asks the runtime', async () => {
    const folder = path.join(home.root, 'configured');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'foliwake.config.json'), '{}');
    const who = await engine(['whoami'], { cwd: folder });
    assert.equal(who.code, 0, who.stderr);
    assert.match(who.stdout, /^Server {9}none \(this computer, local configuration\)$/m);
    const recover = await engine(['operation', 'recover', '--break-lock', '--config', 'x.json']);
    assert.equal(recover.code, 0, recover.stderr);
    assert.match(recover.stdout, /^Removed the state lock of my-site \(fake\)\.$/m);
    const remote = await engine(['operation', 'recover', '--break-lock', '--server', fake.origin]);
    assert.equal(remote.code, 2);
    assert.match(unwrapped(remote.stderr), /--break-lock needs the site's local configuration/);
  });

  test("a local failure is the engine's core error; --timings goes to the engine", async () => {
    const run = await engine(['site', 'status', '--config', 'x.json', '--site', 'broken', '--json']);
    assert.equal(run.code, 1);
    assert.equal(run.json.error.code, 'FAKE_LOCAL');
    const timed = await engine(['operation', 'recover', '--config', 'x.json', '--timings']);
    assert.ok(localCalls(timed.stderr).includes('local: timed recover'), timed.stderr);
  });

  test('local flags are shown with the engine; dev, local or --remote, is served by it', async () => {
    const help = await engine(['site', 'status', '--help']);
    assert.match(help.stdout, /--config=<value>\s+project configuration/);
    const dev = await engine(['dev', '--port', '3999', '--config', 'x.json', '--site', 'a']);
    assert.equal(dev.code, 0, dev.stderr);
    const options = { port: 3999, config: 'x.json', site: 'a' };
    const line = localCalls(dev.stderr).find((each) => each.startsWith('local: dev '));
    assert.deepEqual(JSON.parse(line.slice('local: dev '.length)), options);
    const viaEngine = await engine(['dev', '--remote', 'live', '--port', '3998']);
    const served = localCalls(viaEngine.stderr).find((each) => each.startsWith('local: dev '));
    assert.deepEqual(JSON.parse(served.slice('local: dev '.length)), { port: 3998, remote: { target: 'live' } });
    const refused = await engine(['dev', '--port', '3997']);
    assert.equal(refused.code, 2, "the engine's exit code");
    const remote = await engine(['dev', '--remote', '--config', 'x.json']);
    assert.equal(remote.code, 2);
    assert.match(unwrapped(remote.stderr), /--config does not apply with --remote/);
  });
});

test('create: the engine trusts the configuration of the new project', async () => {
  const home = await cliHome();
  try {
    const args = ['create', 'made', '--no-interactive', '--no-connect', '--no-git'];
    const run = await runCli(args, { env: home.env, cwd: home.cwd, bin: ENGINE_BIN });
    assert.equal(run.code, 0, run.stderr);
    assert.ok(localCalls(run.stderr).includes('local: created made'), run.stderr);
  } finally {
    await home.cleanup();
  }
});

describe('without the engine', () => {
  let home;
  before(async () => {
    home = await cliHome();
  });
  after(() => home.cleanup());

  test('local flags stay hidden and say what they need', async () => {
    const help = await runCli(['site', 'status', '--help'], { env: home.env, cwd: home.cwd });
    assert.doesNotMatch(help.stdout, /--config/);
    const run = await runCli(['site', 'status', '--config', 'x.json'], { env: home.env, cwd: home.cwd });
    assert.equal(run.code, 2);
    assert.match(unwrapped(run.stderr), /--config needs the Foliwake engine/);
    const dev = await runCli(['dev'], { env: home.env, cwd: home.cwd });
    assert.equal(dev.code, 2);
    assert.match(unwrapped(dev.stderr), /needs the Foliwake engine/);
  });
});
