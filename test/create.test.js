// create-foliwake (ported from the engine's tests of `foliwake create`): answers from flags, prompts and
// defaults; the rules for a non-empty folder; `.git` never touched; the first commit with the user's own Git
// identity; the planned files checked with @foliwake/site-check before anything is written; the command line.
// No server step: the site id comes only from --site, and nothing connects anywhere.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  CLI,
  CREATE_VERSION,
  CreateUsageError,
  EXIT_CANCELLED,
  IDENTITY,
  KEY,
  SITE_CHECK_VERSION,
  git,
  json,
  plainIO,
  projectFiles,
  projectProblems,
  runCreate,
  terminalIO,
  tree,
  workspaces,
} from './helpers/create.js';

const ws = workspaces(after);
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MINIMAL_FILES = [
  '.foliwake/schemas/block-1.schema.json', // for editors (`$schema`), git-ignored: not committed
  '.github/actions/foliwake-request/action.yml',
  '.github/scripts/foliwake-report.py',
  '.github/workflows/branch-preview.yml',
  '.github/workflows/frontend-checks.yml',
  '.github/workflows/production.yml',
  '.gitignore',
  'README.md',
  'components/note/note.css',
  'components/note/note.example.md',
  'components/note/note.json',
  'content/images/foliwake-logo.png',
  'content/index.md',
  'foliwake.config.json',
  'jsconfig.json',
  'package.json',
  'scripts/components.js',
  'site.yaml',
  'styles/styles.css',
  'tests/site.test.mjs',
  'tests/workflows.test.mjs',
];

test('without a terminal nothing is asked: foliwake-site, minimal, no site id, a first commit', async () => {
  const w = await ws();
  const run = plainIO(w.cwd, w.env);
  assert.equal(await runCreate({}, run.io), 0, run.err());
  const target = path.join(w.cwd, 'foliwake-site');
  assert.deepEqual(await tree(target), MINIMAL_FILES);
  const config = json(path.join(target, 'foliwake.config.json'));
  assert.equal(config.sites[0].id, 'foliwake-site', 'local id from the folder name');
  assert.equal(config.sites[0].contentRoot, './content');
  assert.equal(json(path.join(target, 'package.json')).name, 'foliwake-site');
  // The first commit: branch main, the configured identity, every file, a clean tree.
  const branch = git(target, w.env, 'symbolic-ref', '--short', 'HEAD');
  assert.equal(branch, 'main', 'main, not the configured default branch');
  const who = `${IDENTITY.name} <${IDENTITY.email}>`;
  assert.equal(git(target, w.env, 'log', '-1', '--format=%an <%ae>|%cn <%ce>'), `${who}|${who}`);
  const subject = `Create the site with create-foliwake ${CREATE_VERSION} (template minimal)`;
  assert.equal(git(target, w.env, 'log', '-1', '--format=%s'), subject);
  assert.equal(git(target, w.env, 'status', '--porcelain'), '');
  assert.equal(git(target, w.env, 'ls-files').split('\n').length, MINIMAL_FILES.length - 1, 'all but the schema');
  const report = new RegExp(
    `\\nChecked with @foliwake/site-check ${escaped(SITE_CHECK_VERSION)}: no problems\\.\\n` +
      `Created foliwake-site \\(template minimal, create-foliwake ${escaped(CREATE_VERSION)}\\)\\.\\n` +
      'Git: new repository \\(branch main\\), first commit [0-9a-f]{7}\\.\\n',
  );
  assert.match(run.out(), report);
  assert.match(run.out(), /\nNext:\n {2}cd foliwake-site\n {2}npx @foliwake\/site-check /);
  assert.match(run.out(), /foliwake dev --watch\n$/);
  assert.doesNotMatch(run.out(), /npm install/, 'no npm packages without Storybook');
  assert.doesNotMatch(run.out(), /[◆◇│]/, 'no prompt was drawn');
  assert.equal(run.err(), '');
});

test('flags: template, site id, --no-git, a nested folder name', async () => {
  const w = await ws();
  const run = plainIO(w.cwd, w.env);
  const request = { folder: 'sites/My Site', template: 'examples', site: 'shop', git: false };
  assert.equal(await runCreate(request, run.io), 0, run.err());
  const target = path.join(w.cwd, 'sites', 'My Site');
  assert.ok(!existsSync(path.join(target, '.git')), 'no repository with --no-git');
  const files = await tree(target);
  const expected = [
    'components/quiz/quiz.js',
    'components/steps/steps.json',
    'content/blocks.md',
    'components/note/note.json',
  ];
  for (const file of expected) assert.ok(files.includes(file), file);
  const config = json(path.join(target, 'foliwake.config.json'));
  assert.equal(config.sites[0].id, 'shop');
  assert.equal(config.sites[0].liveHosts[0], 'shop.localhost');
  assert.equal(json(path.join(target, 'package.json')).name, 'my-site');
  const readme = await readFile(path.join(target, 'README.md'), 'utf8');
  assert.match(readme, /^# My Site\n/);
  assert.match(readme, /template `examples`/);
  assert.match(readme, /site id `shop`/);
  assert.doesNotMatch(readme, /\{\{\w+\}\}/, 'every placeholder filled');
  assert.match(run.out(), /Created sites\/My Site \(template examples, create-foliwake [^,]+, site id shop\)\./);
  assert.match(run.out(), /Git: skipped\./);
  assert.match(run.out(), /cd 'sites\/My Site'/, 'a quoted shell word');
});

test('refused input: unknown template, bad site id, empty folder name', async () => {
  const w = await ws();
  for (const request of [{ template: 'big' }, { site: 'Bad_ID' }, { folder: '  ' }]) {
    await assert.rejects(runCreate(request, plainIO(w.cwd, w.env).io), CreateUsageError, JSON.stringify(request));
  }
  assert.deepEqual(await readdir(w.cwd), [], 'nothing written');
});

test('a non-empty folder without a choice is refused, unchanged; only .git counts as empty', async () => {
  const w = await ws();
  const target = path.join(w.cwd, 'site');
  await mkdir(path.join(target, '.git'), { recursive: true });
  await writeFile(path.join(target, '.git', 'marker'), 'mine');
  await writeFile(path.join(target, 'notes.txt'), 'mine');
  const refused = /site is not empty \(notes\.txt\)\. .*--overwrite.*--keep-existing/;
  await assert.rejects(runCreate({ folder: 'site' }, plainIO(w.cwd, w.env).io), refused);
  assert.deepEqual((await readdir(target)).sort(), ['.git', 'notes.txt']);

  const onlyGit = path.join(w.cwd, 'only-git');
  await mkdir(path.join(onlyGit, '.git'), { recursive: true });
  await writeFile(path.join(onlyGit, '.git', 'marker'), 'mine');
  const run = plainIO(w.cwd, w.env);
  assert.equal(await runCreate({ folder: 'only-git', git: false }, run.io), 0, run.err());
  assert.equal(await readFile(path.join(onlyGit, '.git', 'marker'), 'utf8'), 'mine');
});

test('--overwrite removes the files but never .git; inside a repository nothing is committed', async () => {
  const w = await ws();
  const target = path.join(w.cwd, 'site');
  await mkdir(target);
  git(target, w.env, 'init', '-q');
  const head = readFileSync(path.join(target, '.git', 'HEAD'), 'utf8');
  await mkdir(path.join(target, 'old', 'deep'), { recursive: true });
  await writeFile(path.join(target, 'old', 'deep', 'a.txt'), 'old');
  await writeFile(path.join(target, 'README.md'), 'old readme');
  const run = plainIO(w.cwd, w.env);
  assert.equal(await runCreate({ folder: 'site', existing: 'clear' }, run.io), 0, run.err());
  assert.ok(!existsSync(path.join(target, 'old')), 'old files removed');
  assert.notEqual(await readFile(path.join(target, 'README.md'), 'utf8'), 'old readme');
  assert.equal(readFileSync(path.join(target, '.git', 'HEAD'), 'utf8'), head, '.git untouched');
  assert.throws(() => git(target, w.env, 'rev-parse', 'HEAD'), 'no commit was made in the existing repository');
  const inside = /Git: site is inside the repository .*; no repository was created and nothing was committed\./;
  assert.match(run.out(), inside);
});

test('--keep-existing adds next to existing files, refuses to replace one, and never commits them', async () => {
  const w = await ws();
  const target = path.join(w.cwd, 'site');
  await mkdir(target);
  await writeFile(path.join(target, 'notes.txt'), 'mine');
  const run = plainIO(w.cwd, w.env);
  assert.equal(await runCreate({ folder: 'site', existing: 'keep' }, run.io), 0, run.err());
  assert.equal(await readFile(path.join(target, 'notes.txt'), 'utf8'), 'mine');
  assert.deepEqual(git(target, w.env, 'status', '--porcelain'), '?? notes.txt', 'the kept file is not committed');

  const clash = path.join(w.cwd, 'clash');
  await mkdir(path.join(clash, 'content'), { recursive: true });
  await writeFile(path.join(clash, 'content', 'index.md'), 'mine');
  const refused = /clash already has content\/index\.md; kept files are never replaced\. Nothing was written\./;
  await assert.rejects(runCreate({ folder: 'clash', existing: 'keep' }, plainIO(w.cwd, w.env).io), refused);
  assert.deepEqual(await tree(clash), ['content/index.md']);
});

test('the first commit uses the configured identity only; without one: the project stays, exit 1', async () => {
  const w = await ws({ identity: null });
  const run = plainIO(w.cwd, { ...w.env, EMAIL: '', GIT_AUTHOR_NAME: undefined });
  assert.equal(await runCreate({ folder: 'site' }, run.io), 1);
  const target = path.join(w.cwd, 'site');
  assert.ok(existsSync(path.join(target, 'content', 'index.md')), 'the project files stay');
  assert.ok(existsSync(path.join(target, '.git')), 'the repository exists');
  assert.match(run.out(), /Git: FAILED at `git commit`/);
  assert.match(run.err(), /git config --global user\.name/);
});

test('a terminal asks only what is missing, in order; Enter takes the defaults; no site id question', async () => {
  const w = await ws();
  const term = terminalIO(w.cwd, w.env, [
    [/Project folder/, KEY.enter],
    [/Template/, KEY.down + KEY.enter],
    [/React support/, KEY.enter],
    [/Storybook/, KEY.enter],
    [/Git repository/, KEY.enter],
  ]);
  assert.equal(await runCreate({}, term.io), 0, term.err() + term.screen());
  assert.equal(term.answered(), 5);
  assert.doesNotMatch(term.screen(), /Site id|Install its npm packages|Foliwake server/);
  const target = path.join(w.cwd, 'foliwake-site');
  assert.ok(!existsSync(path.join(target, '.storybook')), 'Storybook: No by default');
  assert.ok(!existsSync(path.join(target, 'scripts/vendor')), 'React: No by default');
  assert.ok(existsSync(path.join(target, 'components/quiz/quiz.js')), 'examples chosen with ↓');
  assert.equal(json(path.join(target, 'foliwake.config.json')).sites[0].id, 'foliwake-site');
  assert.ok(git(target, w.env, 'rev-parse', 'HEAD'));

  // Everything given: no question at all, even in a terminal.
  const all = terminalIO(w.cwd, w.env, []);
  const given = { folder: 'given', template: 'minimal', site: '', react: false, storybook: false, git: false };
  assert.equal(await runCreate(given, all.io), 0, all.err());
  assert.doesNotMatch(all.screen(), /Project folder|Template|Site id|React|Storybook|Install|Git repository/);
});

test('a terminal asks about a non-empty folder; Ctrl+C cancels with nothing written (exit 130)', async () => {
  const w = await ws();
  const target = path.join(w.cwd, 'site');
  await mkdir(target);
  await writeFile(path.join(target, 'notes.txt'), 'mine');
  const cancelled = terminalIO(w.cwd, w.env, [[/is not empty \(notes\.txt\)\. What now\?/, KEY.enter]]);
  assert.equal(await runCreate({ folder: 'site' }, cancelled.io), EXIT_CANCELLED);
  assert.match(cancelled.screen(), /Operation cancelled\. Nothing was created\./);
  assert.deepEqual(await readdir(target), ['notes.txt']);

  const ctrlC = terminalIO(w.cwd, w.env, [[/Template/, KEY.ctrlC]]);
  assert.equal(await runCreate({ folder: 'fresh' }, ctrlC.io), EXIT_CANCELLED);
  assert.match(ctrlC.screen(), /Operation cancelled/);
  assert.ok(!existsSync(path.join(w.cwd, 'fresh')));

  const clear = terminalIO(w.cwd, w.env, [[/What now\?/, KEY.down + KEY.enter]]);
  const given = { folder: 'site', template: 'minimal', site: '', react: false, storybook: false, git: false };
  assert.equal(await runCreate(given, clear.io), 0, clear.err());
  assert.ok(!existsSync(path.join(target, 'notes.txt')), 'removed after choosing "Remove"');
});

test('a broken starter is caught by @foliwake/site-check; every diagnostic counts, a note too', async () => {
  const target = path.join('/tmp', 'x');
  for (const template of ['minimal', 'examples']) {
    assert.deepEqual(await projectProblems(await projectFiles({ template, target, siteId: null })), [], template);
  }
  const files = await projectFiles({ template: 'examples', target, siteId: null });
  const replace = (file, text) => files.map((f) => (f.path === file ? { ...f, bytes: Buffer.from(text) } : f));
  const withoutLoader = files.filter((f) => f.path !== 'scripts/components.js');
  const missing = /^scripts\/components\.js:1:1 error CODE_FILE_REQUIRED: .*scripts\/components\.js; it is missing/;
  assert.ok((await projectProblems(withoutLoader)).some((p) => missing.test(p)));
  const badImport = replace('components/quiz/quiz.js', "import x from 'lodash';\nexport default function init() {}\n");
  const notRelative =
    /^components\/quiz\/quiz\.js:1:1 error CODE_REFERENCE_NOT_RELATIVE: reference "lodash" is not relative/;
  assert.ok((await projectProblems(badImport)).some((p) => notRelative.test(p)));
  const note = [...files, { path: 'scripts/extra.txt', bytes: Buffer.from('x') }];
  assert.ok((await projectProblems(note)).some((p) => /^scripts\/extra\.txt:1:1 info CODE_PATH_IGNORED/.test(p)));
  // Pages are not rendered by create (the Foliwake CLI's `foliwake page check` does that): content/ is not code.
  const page = '---\nid: home\npath: /\ntitle: Home\n---\n\n:::note\n\n### Only\n\n:::\n';
  const badPage = replace('content/index.md', page);
  assert.deepEqual(await projectProblems(badPage), []);
});

test('the starters pass site-check strictly: every template × React × Storybook × site id', async () => {
  for (const template of ['minimal', 'examples']) {
    for (const react of [false, true]) {
      for (const storybook of [false, true]) {
        for (const siteId of [null, 'shop']) {
          const files = await projectFiles({ template, target: '/tmp/x', siteId, react, storybook });
          const label = JSON.stringify({ template, react, storybook, siteId });
          assert.deepEqual(await projectProblems(files), [], label);
        }
      }
    }
  }
});

test('through the CLI: -h, --version, refused values exit 2, conflicting flags exit 2', async () => {
  const w = await ws();
  const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: w.cwd, env: w.env, encoding: 'utf8' });
  const help = cli('-h');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--git \/ --no-git/);
  assert.match(help.stdout, /--template minimal\|examples/);
  assert.equal(cli('--version').stdout, `${CREATE_VERSION}\n`);
  assert.equal(cli('x', '--site', 'Bad_ID').status, 2);
  assert.equal(cli('x', '--overwrite', '--keep-existing').status, 2);
  assert.equal(cli('x', '--template', 'big').status, 2);
  assert.deepEqual(await readdir(w.cwd), [], 'nothing written by a refused run');
  const created = cli('cli-site', '--no-git');
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Created cli-site \(template minimal/);
  const again = cli('cli-site', '--no-interactive');
  assert.equal(again.status, 2);
  assert.match(again.stderr, /^create-foliwake: cli-site is not empty/);
  await rm(path.join(w.cwd, 'cli-site'), { recursive: true });
});
