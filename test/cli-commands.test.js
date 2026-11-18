// @foliwake/cli: the remote commands against a fake server driven by the contract's manifest. The texts are the
// engine CLI's for the same answers (checked side by side when the commands moved); --json prints the answer.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { PROCEDURES } from '@foliwake/core-contract';

import * as answers from './fixtures/cli-answers.js';
import { cliHome, runCli } from './helpers/cli.js';
import { FAKE_TOKEN, startFakeCoreServer } from './helpers/fake-core-server.js';

const { SR, SR_OLD } = answers;

const HANDLERS = {
  'sites.list': () => answers.sitesList,
  'sites.status': () => answers.siteStatus,
  'credentials.list': () => answers.credentialsList,
  'account.keys.list': () => answers.keysList,
  'account.keys.ci': () => [],
  'branches.list': () => answers.branchesList,
  'channels.rollback': () => answers.operation('rollback', null, 'queued'),
  'operations.wait': () => answers.operation('rollback', answers.releaseResult),
  'operations.get': () => answers.operation('rollback', answers.releaseResult),
};

describe('remote commands with FOLIWAKE_SERVER and FOLIWAKE_TOKEN (CI)', () => {
  let fake;
  let home;
  let env;
  before(async () => {
    fake = await startFakeCoreServer({ handlers: { ...HANDLERS } });
    home = await cliHome();
    env = { ...home.env, FOLIWAKE_SERVER: fake.origin, FOLIWAKE_TOKEN: FAKE_TOKEN };
  });
  after(async () => {
    await fake.close();
    await home.cleanup();
  });
  const cli = (args) => runCli(args, { env, cwd: home.cwd });

  test('site status: the only site of the server, the same lines as the engine CLI; --json is the answer', async () => {
    const run = await cli(['site', 'status']);
    assert.equal(run.code, 0, run.stderr);
    const lines = run.stdout.split('\n');
    assert.deepEqual(lines.slice(0, 3), [
      'Site       my-site',
      'Live       release 7 · 2026-11-18 01:02 UTC',
      'Preview    none',
    ]);
    assert.match(run.stdout, /^Pending {4}nothing$/m);
    assert.deepEqual(fake.rpcCalls('sites.status').at(-1).input, { site: 'my-site' });
    const json = await cli(['site', 'status', '--json']);
    assert.deepEqual(json.json, answers.siteStatus);
  });

  test('site list, credential list, account keys list, branch list: text and JSON', async () => {
    const list = await cli(['site', 'list']);
    assert.match(list.stdout, /^my-site\n {2}org {13}acme-org\n/);
    const credentials = await cli(['credential', 'list']);
    assert.equal(
      credentials.stdout,
      'DRIVE_KEY: set (file) · updated 2026-11-18T01:02:03.000Z · used by my-site/docs\n',
    );
    assert.deepEqual((await cli(['credential', 'list', '--json'])).json, answers.credentialsList);
    const keys = await cli(['account', 'keys', 'list', '--json']);
    assert.deepEqual(keys.json, { computers: answers.keysList, ci: [] });
    const branches = await cli(['branch', 'list']);
    assert.match(
      branches.stdout,
      /^main \(default\) +cd_b{32} {2}- {2}https:\/\/main--0123abcd\.preview\.example\.com\/\n$/,
    );
  });

  test('release rollback: a mutation, followed to its commit in slices; the release report', async () => {
    const run = await cli(['release', 'rollback', SR_OLD, '--expect', SR]);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.stdout, `Rolled back to ${SR_OLD} (${SR}, generation 8).\n`);
    const [call] = fake.rpcCalls('channels.rollback');
    assert.equal(call.method, 'POST');
    assert.deepEqual(call.input, { site: 'my-site', to: SR_OLD, expect: { live: SR } });
    assert.ok(fake.rpcCalls('operations.wait').length >= 1);
    const json = await cli(['release', 'rollback', SR_OLD, '--expect', SR, '--json']);
    assert.equal(json.json.kind, 'rollback');
  });

  test('--config and --content need the engine; so do preview --site and operation recover --break-lock', async () => {
    for (const args of [
      ['site', 'status', '--config', 'x.json'],
      ['page', 'check', '--content', '.'],
      ['preview', '--site', 'my-site'],
      ['operation', 'recover', '--break-lock'],
    ]) {
      const run = await cli(args);
      assert.equal(run.code, 2, args.join(' '));
      assert.match(run.stderr, /needs the Foliwake engine/, args.join(' '));
    }
  });

  test('--timings reports the total time on stderr only', async () => {
    const run = await cli(['source', 'sync', '--timings', '--input', '{"site":"my-site","target":{"all":true}}']);
    assert.match(run.stderr, /timings: sync \d+ ms in total \(phase timings need the engine\)/);
  });
});

describe('a folder linked to a site', () => {
  let fake;
  let home;
  before(async () => {
    fake = await startFakeCoreServer({ handlers: { ...HANDLERS } });
    home = await cliHome();
    await mkdir(path.join(home.cwd, '.foliwake'), { recursive: true });
    const connection = { server: fake.origin, site: 'linked-site', org: 'acme-org' };
    await writeFile(path.join(home.cwd, '.foliwake', 'connection.json'), JSON.stringify(connection));
  });
  after(async () => {
    await fake.close();
    await home.cleanup();
  });

  test('names the server and the default --site; FOLIWAKE_TOKEN goes with FOLIWAKE_SERVER only', async () => {
    const env = { ...home.env, FOLIWAKE_SERVER: fake.origin, FOLIWAKE_TOKEN: FAKE_TOKEN };
    const run = await runCli(['site', 'status', '--json'], { env, cwd: home.cwd });
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(fake.rpcCalls('sites.status').at(-1).input, { site: 'linked-site' });
    const other = await runCli(['site', 'status', '--site', 'my-site'], { env, cwd: home.cwd });
    assert.equal(other.code, 0);
    assert.deepEqual(fake.rpcCalls('sites.status').at(-1).input, { site: 'my-site' });
  });

  test('without a sign-in for its server: UNAUTHORIZED and the login hint', async () => {
    const run = await runCli(['site', 'status'], { env: home.env, cwd: home.cwd });
    assert.equal(run.code, 1);
    assert.match(run.stderr, /UNAUTHORIZED/);
    assert.match(run.stderr, new RegExp(`Sign in with \`foliwake login ${fake.origin}\``));
  });
});

describe('a server older than the CLI', () => {
  let fake;
  let home;
  before(async () => {
    const manifest = { ...PROCEDURES };
    delete manifest['sites.status'];
    fake = await startFakeCoreServer({ handlers: { ...HANDLERS }, manifest });
    home = await cliHome();
  });
  after(async () => {
    await fake.close();
    await home.cleanup();
  });

  test('PROCEDURE_UNKNOWN, with the hint to update the server or use an older CLI', async () => {
    const env = { ...home.env, FOLIWAKE_SERVER: fake.origin, FOLIWAKE_TOKEN: FAKE_TOKEN };
    const run = await runCli(['site', 'status', '--site', 'my-site'], { env, cwd: home.cwd });
    assert.equal(run.code, 1);
    assert.match(run.stderr, /PROCEDURE_UNKNOWN/);
    assert.match(run.stderr, /The server is older than this CLI \(@foliwake\/cli 0\.\d+\.\d+\)/);
    const json = await runCli(['site', 'status', '--site', 'my-site', '--json'], { env, cwd: home.cwd });
    assert.equal(json.json.error.code, 'PROCEDURE_UNKNOWN');
  });
});

describe('create', () => {
  let fake;
  let home;
  const created = answers.siteCreateResult;
  before(async () => {
    const handlers = {
      ...HANDLERS,
      'sites.create': (input) => ({ ...answers.operation('create', null, 'queued'), site: input.site }),
      'operations.wait': (input) => ({ ...answers.operation('create', created), site: input.site }),
      'operations.get': (input) => ({ ...answers.operation('create', created), site: input.site }),
    };
    fake = await startFakeCoreServer({ handlers });
    home = await cliHome();
  });
  after(async () => {
    await fake.close();
    await home.cleanup();
  });

  test('create my-site --no-interactive --server … --create-site: the project, then its site', async () => {
    const identity = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com' };
    const committer = { GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' };
    const env = { ...home.env, ...identity, ...committer, FOLIWAKE_SERVER: fake.origin, FOLIWAKE_TOKEN: FAKE_TOKEN };
    const args = ['create', 'my-site', '--no-interactive', '--server', fake.origin, '--create-site'];
    const run = await runCli(args, { env, cwd: home.cwd });
    assert.equal(run.code, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /Checked with @foliwake\/site-check/);
    const [call] = fake.rpcCalls('sites.create');
    assert.equal(call.input.site, 'my-site');
    assert.match(call.input.code.commit, /^[0-9a-f]{40}$/, 'the first commit is sent as a bundle');
    const link = JSON.parse(await readFile(path.join(home.cwd, 'my-site', '.foliwake', 'connection.json'), 'utf8'));
    assert.deepEqual(link, { server: fake.origin, site: 'my-site', org: 'acme-org' });
  });
});
