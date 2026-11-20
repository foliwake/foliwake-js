// `foliwake source disable` and `source enable` against a fake server: the input they send (with and without
// --expect), what they print, `unchanged`, --json, a missing --source, and `source list` naming a disabled source.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { cliHome, runCli } from './helpers/cli.js';
import { FAKE_TOKEN, startFakeCoreServer } from './helpers/fake-core-server.js';

const switched = (enabled) => (input) => ({
  site: input.site,
  source: input.source,
  enabled,
  revision: '13',
  unchanged: input.source === 'same',
  selected: input.source === 'fresh' ? null : 'ss_0001',
});

const listed = {
  site: 'my-site',
  sources: [
    {
      id: 'lessons',
      plugin: 'google-drive-markdown',
      displayName: 'Lessons',
      status: 'installed',
      problem: null,
      owns: ['/lessons'],
      enabled: false,
      mode: 'snapshot',
      selected: null,
      latestAttempt: null,
      stale: false,
    },
  ],
  identity: { ledger: { observed: 0, bound: 0, published: 0 }, acceptances: 0, backfilledAt: null, verifiedHeads: [] },
  registryProblems: [],
};

describe('source disable / enable', () => {
  let fake;
  let home;
  let env;
  before(async () => {
    const handlers = {
      'sources.disable': switched(false),
      'sources.enable': switched(true),
      'sources.list': () => listed,
    };
    fake = await startFakeCoreServer({ handlers });
    home = await cliHome();
    env = { ...home.env, FOLIWAKE_SERVER: fake.origin, FOLIWAKE_TOKEN: FAKE_TOKEN };
  });
  after(async () => {
    await fake.close();
    await home.cleanup();
  });
  const cli = (args) => runCli(args, { env, cwd: home.cwd });

  test('disable: a mutation with the source; says what is kept and how to enable it again', async () => {
    const run = await cli(['source', 'disable', '--site', 'my-site', '--source', 'lessons']);
    assert.equal(run.code, 0, run.stderr);
    const [call] = fake.rpcCalls('sources.disable');
    assert.equal(call.method, 'POST');
    assert.deepEqual(call.input, { site: 'my-site', source: 'lessons' });
    assert.match(run.stdout, /^my-site: source lessons disabled; revision 13\.$/m);
    assert.match(run.stdout, /preview keeps reading snapshot ss_0001\. Its live pages and owned paths are kept\./);
    assert.match(run.stdout, /source enable --source lessons/);
  });

  test('enable with --expect; already enabled: unchanged; --json is the answer', async () => {
    const run = await cli(['source', 'enable', '--site', 'my-site', '--source', 'lessons', '--expect', '12']);
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(fake.rpcCalls('sources.enable').at(-1).input, {
      site: 'my-site',
      source: 'lessons',
      expect: { revision: '12' },
    });
    assert.match(run.stdout, /source lessons enabled; revision 13\./);
    const same = await cli(['source', 'enable', '--site', 'my-site', '--source', 'same']);
    assert.match(same.stdout, /source same was already enabled; nothing changed\./);
    const json = await cli(['source', 'disable', '--site', 'my-site', '--source', 'fresh', '--json']);
    assert.deepEqual(JSON.parse(json.stdout).selected, null);
  });

  test('without --source: a usage error, nothing sent', async () => {
    const before = fake.rpcCalls('sources.disable').length;
    const run = await cli(['source', 'disable', '--site', 'my-site']);
    assert.equal(run.code, 2);
    assert.match(run.stderr, /--source <id>/);
    assert.equal(fake.rpcCalls('sources.disable').length, before);
  });

  test('source list names a disabled source', async () => {
    const run = await cli(['source', 'list', '--site', 'my-site']);
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /installed, disabled\n {2}DISABLED: not synced; preview and publish keep/);
    assert.match(run.stdout, /not synced — disabled: `foliwake source enable --source lessons` first/);
  });
});
