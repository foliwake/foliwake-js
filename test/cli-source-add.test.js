// `foliwake source add` and `source check` of a new source, against a fake server: the entry each plugin's
// flags build (a Drupal list title, Google Docs pages, private hosts), a failed check saves nothing without
// --force, a candidate is checked without being saved, and the hint when another source owns the whole site.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { entryOf, googleDocument } from '../packages/cli/dist/source-entry.js';
import { cliHome, runCli } from './helpers/cli.js';
import { FAKE_TOKEN, startFakeCoreServer } from './helpers/fake-core-server.js';

const DOC = '1AbCdEfGhIjKlMnOp';

test('the entries of the flags: Drupal list titles, Google Docs pages, private hosts', () => {
  const drupal = entryOf(
    {
      plugin: 'drupal',
      id: 'news',
      owns: ['/articles'],
      'base-url': 'https://cms.internal',
      language: ['en', 'es'],
      'list-title': ['News'],
      'allow-private-host': ['cms.internal'],
    },
    undefined,
  );
  assert.deepEqual(drupal.value.settings.languages, [{ langcode: 'en', listTitle: 'News' }, { langcode: 'es' }]);
  assert.deepEqual(drupal.value.operator, { allowPrivateHosts: ['cms.internal'] });
  const tooMany = entryOf({
    plugin: 'drupal',
    id: 'n',
    'base-url': 'https://x.org',
    language: ['en'],
    'list-title': ['a', 'b'],
  });
  assert.match(tooMany.problem, /at most one --list-title per --language/);
  const link = `https://docs.google.com/document/d/${DOC}/edit?tab=t.1`;
  const docs = entryOf({ plugin: 'google-docs', id: 'guides', owns: ['/guides'], page: [`${link}=/guides/intro`] });
  assert.deepEqual(docs.value.settings, {
    auth: 'service-account',
    pages: [{ documentId: DOC, tabId: 't.1', path: '/guides/intro' }],
  });
  assert.deepEqual(docs.value.credentials, { serviceAccountKey: 'FOLIWAKE_GOOGLE_SA_KEY' });
  assert.equal(entryOf({ plugin: 'google-docs', id: 'g' }).ok, false, 'pages or a folder are needed');
  assert.equal(googleDocument('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit').ok, false);
});

const probeAnswer = (input, extra = {}) => ({
  site: input.site,
  revision: 'sha256:1',
  source: input.candidate?.id ?? input.source,
  plugin: input.candidate?.plugin ?? 'drupal',
  fields: {},
  credentials: [],
  connection: { ok: false, target: 'https://cms.internal', problems: [] },
  listing: null,
  layout: null,
  suggestions: { owns: [], overlaps: [] },
  checkedAt: '2026-11-18T00:00:00.000Z',
  ...extra,
});

describe('source add and source check against a server', () => {
  let fake;
  let home;
  let env;
  before(async () => {
    const whole = {
      'sources.news.owns':
        'sources "content" (/) and "news" (/articles) both own the same pages; ' +
        '"content" owns the whole site ("/"), so narrow it first',
    };
    const handlers = {
      'sources.probe': (input) =>
        probeAnswer(input, input.candidate?.id === 'clash' ? { fields: whole, connection: null } : {}),
      'sources.add': (input) => ({
        site: input.site,
        revision: 'sha256:2',
        unchanged: false,
        source: { id: input.entry.id, plugin: input.entry.plugin, owns: input.entry.owns, mappings: 0 },
        nextSteps: [],
      }),
      'sources.list': () => ({ site: 'my-site', sources: [{ id: 'content' }] }),
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
  const drupal = [
    '--site',
    'my-site',
    '--plugin',
    'drupal',
    '--owns',
    '/articles',
    '--base-url',
    'https://cms.internal',
    '--language',
    'en',
  ];

  test('a failed connection check saves nothing without --force', async () => {
    const refused = await cli(['source', 'add', ...drupal, '--id', 'news', '--yes']);
    assert.equal(refused.code, 1);
    assert.match(
      refused.stderr,
      /The connection check failed; nothing was saved\. Fix it and run again, or pass --force\./,
    );
    assert.equal(fake.rpcCalls('sources.add').length, 0);
    const forced = await cli([
      'source',
      'add',
      ...drupal,
      '--id',
      'news',
      '--yes',
      '--force',
      '--allow-private-host',
      'cms.internal',
    ]);
    assert.equal(forced.code, 0, forced.stderr);
    assert.deepEqual(fake.rpcCalls('sources.add')[0].input.entry.operator, { allowPrivateHosts: ['cms.internal'] });
  });

  test('source check --id: a candidate is probed, nothing saved; --source and --id together are refused', async () => {
    const before = fake.rpcCalls('sources.add').length;
    const checked = await cli(['source', 'check', ...drupal, '--id', 'news', '--json']);
    assert.equal(checked.code, 1, 'the fake connection fails');
    assert.equal(fake.rpcCalls('sources.probe').at(-1).input.candidate.id, 'news');
    assert.equal(fake.rpcCalls('sources.add').length, before);
    const both = await cli(['source', 'check', '--site', 'my-site', '--source', 'content', '--id', 'news']);
    assert.equal(both.code, 2);
  });

  test('another source owns the whole site: how to narrow it', async () => {
    const run = await cli(['source', 'add', ...drupal, '--id', 'clash', '--yes']);
    assert.equal(run.code, 1);
    assert.match(run.stdout, /Source "content" owns the whole site \(\/\)/);
    assert.match(run.stdout, /foliwake site set --site my-site sources\.0\.owns '\["=\/", "\/blocks"\]'/);
  });
});
