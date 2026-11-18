// `foliwake connect`: the same code as `site create` and `site link`, chosen in one step; against a fake server.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import * as answers from './fixtures/cli-answers.js';
import { cliHome, runCli } from './helpers/cli.js';
import { FAKE_TOKEN, startFakeCoreServer } from './helpers/fake-core-server.js';

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

/** A project folder with one commit. */
async function project(root, name) {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'README.md'), '# site\n');
  const git = (args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...GIT_IDENTITY } });
  git(['init', '--quiet', '--initial-branch', 'main']);
  git(['add', 'README.md']);
  git(['commit', '--quiet', '-m', 'first']);
  return dir;
}

const readLink = async (dir) => JSON.parse(await readFile(path.join(dir, '.foliwake', 'connection.json'), 'utf8'));

describe('connect', () => {
  let fake;
  let home;
  let env;
  const createdOn = (site) => ({ ...answers.siteCreateResult, site });
  before(async () => {
    const handlers = {
      'sites.list': () => answers.sitesList,
      'sites.create': (input) => ({ ...answers.operation('create', null, 'queued'), site: input.site }),
      'operations.wait': (input) => ({ ...answers.operation('create', createdOn(input.site)), site: input.site }),
      'operations.get': (input) => ({ ...answers.operation('create', createdOn(input.site)), site: input.site }),
    };
    fake = await startFakeCoreServer({ handlers });
    home = await cliHome();
    env = { ...home.env, ...GIT_IDENTITY, FOLIWAKE_SERVER: fake.origin, FOLIWAKE_TOKEN: FAKE_TOKEN };
  });
  after(async () => {
    await fake.close();
    await home.cleanup();
  });

  test('--create <id>: the site is created from the last commit and the folder linked to it', async () => {
    const cwd = await project(home.root, 'newsite');
    const run = await runCli(['connect', '--create', 'newsite', '--server', fake.origin, '--json'], { env, cwd });
    assert.equal(run.code, 0, `${run.stdout}\n${run.stderr}`);
    assert.deepEqual(run.json, { server: fake.origin, site: 'newsite', created: true });
    const [call] = fake.rpcCalls('sites.create');
    assert.equal(call.input.site, 'newsite');
    assert.match(call.input.code.commit, /^[0-9a-f]{40}$/);
    assert.deepEqual(await readLink(cwd), { server: fake.origin, site: 'newsite', org: 'acme-org' });
  });

  test('--link <id>: a site the account may develop; nothing created', async () => {
    const cwd = await project(home.root, 'clone');
    const before = fake.rpcCalls('sites.create').length;
    const run = await runCli(['connect', '--link', 'my-site', '--json'], { env, cwd });
    assert.equal(run.code, 0, `${run.stdout}\n${run.stderr}`);
    assert.deepEqual(run.json, { server: fake.origin, site: 'my-site', created: false });
    assert.equal(fake.rpcCalls('sites.create').length, before);
    assert.equal((await readLink(cwd)).site, 'my-site');
  });

  test('a folder linked already is refused; --force replaces the link', async () => {
    const cwd = path.join(home.root, 'clone');
    const again = await runCli(['connect', '--link', 'my-site'], { env, cwd });
    assert.equal(again.code, 1);
    const said = again.stderr.replace(/\s*›\s*/g, ' ');
    assert.match(said, /linked to site my-site on \S+ already/);
    assert.match(said, /--force/);
    assert.match(said, /foliwake site unlink/);
    const forced = await runCli(['connect', '--link', 'my-site', '--force', '--json'], { env, cwd });
    assert.equal(forced.code, 0, forced.stderr);
  });

  test('without a terminal and without --create or --link: a usage error', async () => {
    const cwd = await project(home.root, 'idle');
    const run = await runCli(['connect'], { env, cwd });
    assert.equal(run.code, 2);
    assert.match(run.stderr, /--create <id> or --link <id>/);
    const both = await runCli(['connect', '--create', 'a', '--link', 'b'], { env, cwd });
    assert.equal(both.code, 2);
  });

  test('--create: the organisation is said, the repository is the folder\'s origin as https://', async () => {
    const cwd = await project(home.root, 'withorigin');
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/withorigin.git'], { cwd });
    const run = await runCli(['connect', '--create', 'withorigin'], { env, cwd });
    assert.equal(run.code, 0, `${run.stdout}\n${run.stderr}`);
    const call = fake.rpcCalls('sites.create').find((each) => each.input.site === 'withorigin');
    assert.equal(call.input.org, 'acme-org', 'always named, never left to the server');
    assert.equal(call.input.repository, 'https://github.com/acme/withorigin');
    assert.match(run.stdout, /Organisation: acme-org \(the only one where you may create sites\)/);
    assert.match(run.stdout, /Repository: https:\/\/github\.com\/acme\/withorigin \(this folder's origin/);
    assert.doesNotMatch(run.stdout, /SSH|BRANCH_PREVIEW_SSH_KEY/, 'no SSH secrets in the next steps');
    assert.match(run.stdout, /account keys create --site withorigin --label github-actions/);
    assert.match(run.stdout, /A public repository needs\s+nothing more/);
    const none = await project(home.root, 'norepo');
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/norepo'], { cwd: none });
    const args = ['connect', '--create', 'norepo', '--repository', 'none', '--json'];
    const without = await runCli(args, { env, cwd: none });
    assert.equal(without.code, 0, without.stderr);
    assert.equal(fake.rpcCalls('sites.create').find((each) => each.input.site === 'norepo').input.repository, null);
  });
});

describe('connect --create, an account that may create sites in several organisations', () => {
  let fake;
  let home;
  let env;
  before(async () => {
    const orgs = [
      { id: 'acme-org', name: 'Acme', membership: { role: 'admin', live: true, sites: null } },
      { id: 'beta', name: 'Beta', membership: { role: 'admin', live: false, sites: null } },
      { id: 'gamma', name: 'Gamma', membership: { role: 'author', live: false, sites: null } },
    ];
    const grant = { principal: 'account:acc_x', installation: false, memberships: [] };
    const handlers = {
      whoami: () => grant,
      'org.list': () => orgs,
      'sites.list': () => answers.sitesList,
      'sites.create': (input) => ({ ...answers.operation('create', null, 'queued'), site: input.site }),
      'operations.wait': (input) => ({ ...answers.operation('create', answers.siteCreateResult), site: input.site }),
    };
    fake = await startFakeCoreServer({ handlers });
    home = await cliHome();
    env = { ...home.env, ...GIT_IDENTITY, FOLIWAKE_SERVER: fake.origin, FOLIWAKE_TOKEN: FAKE_TOKEN };
  });
  after(async () => {
    await fake.close();
    await home.cleanup();
  });

  test('without a terminal: refused with the organisations, nothing created; --org chooses', async () => {
    const cwd = await project(home.root, 'twoorgs');
    const run = await runCli(['connect', '--create', 'twoorgs'], { env, cwd });
    assert.equal(run.code, 1);
    assert.match(run.stderr, /You may create sites in 2 organisations; say which one with --org <id>:/);
    assert.match(run.stderr, /acme-org \(Acme\)/);
    assert.match(run.stderr, /beta \(Beta\)/);
    assert.doesNotMatch(run.stderr, /gamma/, 'an author may not create sites there');
    assert.equal(fake.rpcCalls('sites.create').length, 0);
    const chosen = await runCli(['connect', '--create', 'twoorgs', '--org', 'beta', '--json'], { env, cwd });
    assert.equal(chosen.code, 0, chosen.stderr);
    assert.equal(fake.rpcCalls('sites.create')[0].input.org, 'beta');
  });
});
