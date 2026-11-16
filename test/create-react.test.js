// create-foliwake --react (ported from the engine's tests of `foliwake create --react`): React support as an
// opt-in layer (starters/react/: the React example block `poll`) plus the React that this package's build
// vendors from the workspace's exact-pinned react and react-dom (vendor/). create copies it into
// scripts/vendor/; nothing is downloaded.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';

import { isCapturedInput } from '@foliwake/site-check/formats/layout';

import {
  CLI,
  KEY,
  PACKAGE,
  REPO,
  fileText,
  plainIO,
  projectFiles,
  projectProblems,
  runCreate,
  terminalIO,
  workspaces,
} from './helpers/create.js';

const ws = workspaces(after);
const VENDOR = path.join(PACKAGE, 'vendor');
const REACT_FILES = [
  'components/poll/poll.css',
  'components/poll/poll.example.md',
  'components/poll/poll.js',
  'components/poll/poll.json',
  'scripts/react-view.js',
  'scripts/vendor/react.LICENSE.txt',
  'scripts/vendor/react.js',
];
const pinned = (name) => JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8')).devDependencies[name];
const reactLicense = () => readFileSync(path.join(REPO, 'node_modules/react/LICENSE'), 'utf8');
const reactFilesOf = (files) => files.filter((f) => REACT_FILES.includes(f.path)).map((f) => f.path).sort();

test('the build vendors React: one ES module from the exact-pinned react and react-dom, MIT license', async () => {
  for (const name of ['react', 'react-dom']) assert.match(pinned(name), /^\d+\.\d+\.\d+$/, `${name} is pinned exactly`);
  const source = readFileSync(path.join(VENDOR, 'react.js'), 'utf8');
  const banner = `/*! React ${pinned('react')} and ReactDOM ${pinned('react-dom')} `;
  assert.ok(source.startsWith(banner), 'banner names the versions');
  const imports = /\bimport\s*[\s{*("'`]|\bfrom\s*["'`]|process\.env|require\(/;
  assert.doesNotMatch(source, imports, 'self-contained: no imports, no Node globals');
  assert.ok(Buffer.byteLength(source) < 300_000, `minified (${Buffer.byteLength(source)} bytes)`);
  assert.equal(readFileSync(path.join(VENDOR, 'react.LICENSE.txt'), 'utf8'), reactLicense());
  const react = await import(pathToFileURL(path.join(VENDOR, 'react.js')).href);
  assert.equal(react.version, pinned('react'));
  const api = ['createElement', 'createRoot', 'hydrateRoot', 'useState', 'useEffect', 'Fragment', 'createPortal'];
  for (const name of api) assert.ok(react[name], name);
});

test('React files only with react; every combination passes the checks; the script is a release input', async () => {
  for (const template of ['minimal', 'examples']) {
    const plain = await projectFiles({ template, target: '/tmp/x', siteId: null });
    assert.deepEqual(reactFilesOf(plain), [], template);
    for (const storybook of [false, true]) {
      const files = await projectFiles({ template, target: '/tmp/x', siteId: null, react: true, storybook });
      assert.deepEqual(reactFilesOf(files), REACT_FILES);
      assert.deepEqual(await projectProblems(files), [], `${template}, storybook ${storybook}`);
    }
    const files = await projectFiles({ template, target: '/tmp/x', siteId: null, react: true });
    const vendored = files.find((f) => f.path === 'scripts/vendor/react.js').bytes;
    assert.ok(vendored.equals(readFileSync(path.join(VENDOR, 'react.js'))));
    assert.match(fileText(files, 'README.md'), /React is vendored: `scripts\/vendor\/react\.js`/);
    // (The shared README names "the vendored scripts" in its tests/ line; the React note must not be there.)
    assert.doesNotMatch(fileText(plain, 'README.md'), /React is vendored|scripts\/vendor\/react|\{\{/);
    assert.equal(JSON.parse(fileText(files, 'package.json')).dependencies, undefined, 'no npm packages for React');
    // A code release captures the vendored React (scripts/ is captured); its license stays in the repository.
    assert.ok(isCapturedInput('scripts/vendor/react.js'));
    assert.ok(!isCapturedInput('scripts/vendor/react.LICENSE.txt'), 'the license stays in the repository only');
    // So the captured script itself carries React's whole MIT license (a legal comment that minifiers keep).
    const source = vendored.toString('utf8');
    const banner = source.slice(0, source.indexOf('*/') + 2);
    assert.ok(banner.startsWith('/*!'), 'a preserved legal comment');
    const comment = banner.split('\n').map((line) => line.replace(/^ \* ?/, ''));
    for (const line of reactLicense().trim().split('\n')) {
      assert.ok(comment.includes(line), `license line in the vendored file: ${line}`);
    }
  }
});

test('create --react: the files and the starter tests; a terminal asks «Add React support?» (No)', async () => {
  const w = await ws();
  const run = plainIO(w.cwd, w.env);
  const request = { folder: 'site', template: 'examples', react: true, git: false };
  assert.equal(await runCreate(request, run.io), 0, run.err());
  assert.match(run.out(), /Created site \(template examples, React, /);
  for (const file of REACT_FILES) assert.ok(existsSync(path.join(w.cwd, 'site', file)), file);
  const tests = spawnSync(process.execPath, ['--test', 'tests/site.test.mjs'], {
    cwd: path.join(w.cwd, 'site'),
    encoding: 'utf8',
    env: w.env,
  });
  assert.equal(tests.status, 0, tests.stdout + tests.stderr);

  const asked = { template: 'minimal', site: '', storybook: false, git: false };
  const yes = terminalIO(w.cwd, w.env, [[/Add React support\?/, `y${KEY.enter}`]]);
  assert.equal(await runCreate({ folder: 'asked', ...asked }, yes.io), 0, yes.err() + yes.screen());
  assert.equal(yes.answered(), 1);
  assert.ok(existsSync(path.join(w.cwd, 'asked/scripts/vendor/react.js')));
  const no = terminalIO(w.cwd, w.env, [[/Add React support\?/, KEY.enter]]);
  assert.equal(await runCreate({ folder: 'declined', ...asked }, no.io), 0, no.err() + no.screen());
  assert.ok(!existsSync(path.join(w.cwd, 'declined/scripts/vendor')));
  assert.ok(!existsSync(path.join(w.cwd, 'declined/components/poll')));
});

test('through the CLI: --react and --no-react', async () => {
  const w = await ws();
  const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: w.cwd, encoding: 'utf8', env: w.env });
  assert.match(cli('--help').stdout, /--react \/ --no-react/);
  assert.equal(cli('with', '--react', '--no-git').status, 0);
  assert.ok(existsSync(path.join(w.cwd, 'with/scripts/vendor/react.js')));
  assert.ok(existsSync(path.join(w.cwd, 'with/components/poll/poll.js')));
  assert.equal(cli('without', '--no-react', '--no-git').status, 0);
  assert.ok(!existsSync(path.join(w.cwd, 'without/scripts/vendor')));
});
