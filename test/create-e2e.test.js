// create-foliwake end to end, through its command line (packages/create-foliwake/dist/bin.js): every template ×
// React × Storybook (Storybook without install) is created in a temporary folder with --no-interactive, then
// (1) `@foliwake/site-check --strict` finds nothing at all in it, (2) the starter's own tests pass offline with a
// minimal environment, and (3) the "Frontend checks" workflow pins the workspace's @foliwake/site-check version.
// Also: the report and the Next steps of a plain run, and exit status 2 for usage errors. Nothing is downloaded.
// (The engine's end-to-end test of `foliwake create` also ran `foliwake dev` and `code prepare`; those belong to
// the Foliwake CLI.)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { CLI, CREATE_VERSION, SITE_CHECK_CLI, SITE_CHECK_VERSION, workspace } from './helpers/create.js';

const COMBINATIONS = ['minimal', 'examples'].flatMap((template) =>
  [false, true].flatMap((react) => [false, true].map((storybook) => ({ template, react, storybook }))),
);

const nameOf = ({ template, react, storybook }) =>
  [template, react ? 'react' : 'no-react', storybook ? 'storybook' : 'no-storybook'].join('-');

const flagsOf = ({ template, react, storybook }) => [
  '--template',
  template,
  react ? '--react' : '--no-react',
  storybook ? '--storybook' : '--no-storybook',
];

/** Runs `node <args>` in `cwd`; resolves to the finished process (status, stdout, stderr). */
const node = (cwd, env, ...args) => spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8' });

/** Only what the starter's tests need: no npm, no proxy, no tokens. */
const minimalEnv = (w) => ({ PATH: process.env.PATH, HOME: w.dir, NODE_NO_WARNINGS: '1' });

describe('create-foliwake, end to end', () => {
  let w;
  const projects = new Map();
  const outputs = new Map();
  const create = (...args) => node(w.cwd, w.env, CLI, ...args);

  before(async () => {
    w = await workspace();
    for (const combination of COMBINATIONS) {
      const name = nameOf(combination);
      const created = create(name, ...flagsOf(combination), '--no-git', '--no-interactive');
      assert.equal(created.status, 0, `${name}: ${created.stderr}${created.stdout}`);
      projects.set(name, path.join(w.cwd, name));
      outputs.set(name, created.stdout);
    }
  });
  after(() => w?.remove());

  test('every combination passes @foliwake/site-check --strict with no diagnostic at all', () => {
    for (const [name, dir] of projects) {
      const check = node(dir, w.env, SITE_CHECK_CLI, '--strict');
      assert.equal(check.status, 0, `${name}: ${check.stdout}${check.stderr}`);
      assert.match(check.stdout, /: 0 errors, 0 warnings, 0 notes\.\n/, name);
    }
  });

  test("the starter's own tests pass offline in every combination", () => {
    for (const [name, dir] of projects) {
      const tests = node(dir, minimalEnv(w), '--test', 'tests/*.test.mjs');
      assert.equal(tests.status, 0, `${name}: ${tests.stdout}${tests.stderr}`);
      assert.match(tests.stdout, /# fail 0/, name);
    }
  });

  test('the "Frontend checks" workflow pins the workspace\'s @foliwake/site-check version', async () => {
    const pinned = `run: npx -y @foliwake/site-check@${SITE_CHECK_VERSION} . --format github\n`;
    for (const [name, dir] of projects) {
      const workflow = await readFile(path.join(dir, '.github/workflows/frontend-checks.yml'), 'utf8');
      assert.ok(workflow.includes(pinned), `${name}: ${pinned}`);
    }
  });

  test('Storybook without --install: no node_modules, and only then the Next steps say `npm install`', async () => {
    const installStep = /\n {2}npm install {3}\(Storybook; `npm run stories` needs the Foliwake CLI\)\n/;
    for (const combination of COMBINATIONS) {
      const name = nameOf(combination);
      assert.ok(!(await readdir(projects.get(name))).includes('node_modules'), name);
      assert.equal(installStep.test(outputs.get(name)), combination.storybook, name);
    }
  });

  test('the CLI: `create-foliwake my-site --no-interactive` exits 0 and prints the report and the Next steps', () => {
    const created = create('my-site', '--no-interactive');
    assert.equal(created.status, 0, created.stderr);
    assert.equal(created.stderr, '');
    const lines = created.stdout.split('\n');
    assert.equal(lines[1], `Checked with @foliwake/site-check ${SITE_CHECK_VERSION}: no problems.`);
    assert.equal(lines[2], `Created my-site (template minimal, create-foliwake ${CREATE_VERSION}).`);
    assert.match(lines[3], /^Git: new repository \(branch main\), first commit [0-9a-f]{7}\.$/);
    assert.deepEqual(lines.slice(4, 7), ['', 'Next:', '  cd my-site']);
    assert.match(lines[7], /^ {2}npx @foliwake\/site-check /);
    assert.match(created.stdout, /foliwake dev --watch\n$/);
  });

  test('the CLI: usage errors exit 2 with a message and write nothing', async () => {
    const before = (await readdir(w.cwd)).sort();
    const refused = [
      ['--bogus'],
      ['one', 'two'],
      ['x', '--template', 'big'],
      ['x', '--template'],
      ['x', '--site', 'Bad_ID'],
      ['x', '--overwrite', '--keep-existing'],
      ['x', '--git=yes'],
    ];
    for (const args of refused) {
      const run = create(...args, '--no-interactive');
      assert.equal(run.status, 2, `${args.join(' ')}: ${run.stdout}${run.stderr}`);
      assert.match(run.stderr, /^create-foliwake: /, args.join(' '));
      assert.equal(run.stdout, '', args.join(' '));
    }
    assert.deepEqual((await readdir(w.cwd)).sort(), before, 'nothing written');
  });
});
