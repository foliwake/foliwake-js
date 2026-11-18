// create-foliwake --storybook (ported from the engine's tests of `foliwake create --storybook`): Storybook for the
// blocks as an opt-in overlay (starters/storybook/) with exact npm versions; the generated configuration reads
// the manifest of the Foliwake CLI's `foliwake blocks render` (faked here: the CLI is not part of this
// workspace). New in create-foliwake: --install runs `<manager> install` (only with Storybook; the manager that
// ran create, from npm_config_user_agent, else npm) — tested with a fake package manager on PATH, no network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';

import {
  CLI,
  KEY,
  fakePackageManager,
  fileText,
  plainIO,
  projectFiles,
  projectProblems,
  recorded,
  runCreate,
  terminalIO,
  workspaces,
} from './helpers/create.js';

const ws = workspaces(after);
const PNPM_WORKSPACE = ['allowBuilds:', '  esbuild: true', 'onlyBuiltDependencies:', '  - esbuild'];
const NPM_INSTALL_STEP = /\n {2}npm install {3}\(Storybook; `npm run stories` needs the Foliwake CLI\)\n/;

/** The settings of a YAML file, without its comments and blank lines. */
const yamlSettings = (text) => text.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

/** A workspace whose PATH starts with a fake `name` that records its calls in `log`. */
async function withFakeManager(name, status = 0) {
  const w = await ws();
  const log = path.join(w.dir, `${name}.log`);
  const bin = path.join(w.dir, 'fake-bin');
  await fakePackageManager(bin, name, { log, status });
  return { w, log, env: { ...w.env, PATH: `${bin}:${w.env.PATH}` } };
}

/** What `foliwake blocks render` writes for the examples template: the stories manifest and one file per block. */
async function fakeRenderedStories(target) {
  const stories = path.join(target, '.foliwake/stories');
  await mkdir(stories, { recursive: true });
  const blocks = ['note', 'quiz', 'steps'].map((name) => ({ name, stories: `${name}.stories.js` }));
  await writeFile(path.join(stories, 'manifest.json'), JSON.stringify({ schema: 'foliwake-block-stories/1', blocks }));
  return stories;
}

test('the Storybook files are added only with --storybook; the project still passes its checks', async () => {
  for (const template of ['minimal', 'examples']) {
    const plain = await projectFiles({ template, target: '/tmp/x', siteId: null });
    assert.ok(!plain.some((f) => f.path.startsWith('.storybook/')), template);
    const cli = JSON.parse(fileText(plain, 'package.json')).devDependencies;
    assert.deepEqual(Object.keys(cli), ['@foliwake/cli'], 'only the CLI the workflows run');
    const withStorybook = await projectFiles({ template, target: '/tmp/x', siteId: null, storybook: true });
    const config = withStorybook.filter((f) => f.path.startsWith('.storybook/')).map((f) => f.path);
    assert.deepEqual(config, ['.storybook/main.js', '.storybook/preview.js', '.storybook/run.mjs']);
    // pnpm runs no dependency build scripts unless approved; pnpm 11 fails the install on esbuild's
    // (ERR_PNPM_IGNORED_BUILDS). The approval for pnpm >= 10.26 / 11 (allowBuilds) and older 10
    // (onlyBuiltDependencies).
    assert.ok(!plain.some((f) => f.path === 'pnpm-workspace.yaml'), template);
    assert.deepEqual(yamlSettings(fileText(withStorybook, 'pnpm-workspace.yaml')), PNPM_WORKSPACE);
    assert.deepEqual(await projectProblems(withStorybook), [], template);
    const manifest = JSON.parse(fileText(withStorybook, 'package.json'));
    const packages = { ...cli, '@storybook/html-vite': '10.6.3', storybook: '10.6.3', vite: '8.3.5' };
    assert.deepEqual(manifest.devDependencies, packages);
    assert.equal(manifest.scripts.stories, 'node .storybook/run.mjs');
    assert.equal(manifest.scripts['build-stories'], 'foliwake blocks render && storybook build');
    assert.match(fileText(withStorybook, 'README.md'), /`npm install && npm run stories`/);
    assert.doesNotMatch(fileText(plain, 'README.md'), /npm run stories|\{\{/);
    for (const version of Object.values(manifest.devDependencies)) {
      assert.match(version, /^\d+\.\d+\.\d+$/, 'exact versions');
    }
  }
});

test('the generated package.json scripts: check, test, dev, check:pages; stories only with Storybook', async () => {
  const scripts = async (storybook) => {
    const files = await projectFiles({ template: 'minimal', target: '/tmp/x', siteId: null, storybook });
    return JSON.parse(fileText(files, 'package.json')).scripts;
  };
  const common = {
    check: 'npx @foliwake/site-check',
    test: 'node --test "tests/*.test.mjs"',
    dev: 'foliwake dev --watch',
    'check:pages': 'foliwake page check',
  };
  assert.deepEqual(await scripts(false), common);
  const stories = { stories: 'node .storybook/run.mjs', 'build-stories': 'foliwake blocks render && storybook build' };
  assert.deepEqual(await scripts(true), { ...common, ...stories });
});

test('create --storybook: files, next step, no install unless asked; the config loads the manifest', async () => {
  const w = await ws();
  const run = plainIO(w.cwd, w.env);
  const request = { folder: 'site', template: 'examples', storybook: true, git: false };
  assert.equal(await runCreate(request, run.io), 0, run.err());
  assert.match(run.out(), /Created site \(template examples, Storybook, /);
  assert.match(run.out(), NPM_INSTALL_STEP);
  const target = path.join(w.cwd, 'site');
  assert.ok(!existsSync(path.join(target, 'node_modules')), 'create does not run npm');
  const main = pathToFileURL(path.join(target, '.storybook/main.js')).href;
  const missing = /\.foliwake\/stories\/manifest\.json is missing: run `foliwake blocks render` first/;
  await assert.rejects(import(`${main}?before`), missing);
  const stories = await fakeRenderedStories(target);
  const config = (await import(`${main}?after`)).default;
  assert.equal(config.framework.name, '@storybook/html-vite');
  assert.deepEqual(config.stories, [{ directory: '../.foliwake/stories', files: '*.stories.js' }]);
  assert.match(readFileSync(path.join(target, '.storybook/preview.js'), 'utf8'), /import '\.\.\/styles\/styles\.css';/);
  // Blocks import `@foliwake/block-kit`: the configuration aliases the import to the copy in the stories folder.
  const kitCopy = path.join(stories, '_foliwake/block-kit.js');
  const vite = await config.viteFinal({ resolve: { alias: { '@app': '/app' } } });
  assert.deepEqual(vite.resolve.alias[0], { find: '@app', replacement: '/app' }, 'existing aliases kept');
  const kit = vite.resolve.alias.at(-1);
  assert.equal('@foliwake/block-kit'.replace(kit.find, kit.replacement), kitCopy);
  const others = ['foliwake', '@foliwake/block-kit-x', './@foliwake/block-kit'];
  assert.ok(others.every((specifier) => !kit.find.test(specifier)), 'only the bare specifier');
  // /components is static only in a static build: in `storybook dev` it would shadow the block modules Vite transforms.
  assert.deepEqual(config.staticDirs([], { configType: 'PRODUCTION' }), [{ from: '../components', to: '/components' }]);
  assert.deepEqual(config.staticDirs([], { configType: 'DEVELOPMENT' }), []);
});

test('--install with Storybook runs `npm install` in the new project (npm without npm_config_user_agent)', async () => {
  const { w, log, env } = await withFakeManager('npm');
  const run = plainIO(w.cwd, env);
  const request = { folder: 'site', storybook: true, install: true, git: false };
  assert.equal(await runCreate(request, run.io), 0, run.err());
  assert.deepEqual(await recorded(log), [`${path.join(w.cwd, 'site')}|install`]);
  assert.match(run.out(), /\nInstalled the npm packages with npm\.\n/);
  assert.doesNotMatch(run.out(), NPM_INSTALL_STEP, 'no "npm install" step left to do');
});

test('the package manager that ran create installs: pnpm from npm_config_user_agent', async () => {
  const { w, log, env } = await withFakeManager('pnpm');
  const run = plainIO(w.cwd, { ...env, npm_config_user_agent: 'pnpm/10.33.0 npm/? node/v22.22.0 darwin arm64' });
  assert.equal(await runCreate({ folder: 'site', storybook: true, install: true, git: false }, run.io), 0, run.err());
  assert.deepEqual(await recorded(log), [`${path.join(w.cwd, 'site')}|install`]);
  assert.match(run.out(), /Installed the npm packages with pnpm\./);
});

test('a failed install keeps the project and says so: "Install FAILED", exit 0, the Git step still runs', async () => {
  const { w, log, env } = await withFakeManager('npm', 1);
  const run = plainIO(w.cwd, env);
  assert.equal(await runCreate({ folder: 'site', storybook: true, install: true }, run.io), 0, run.err());
  assert.equal((await recorded(log)).length, 1);
  assert.match(run.out(), /\nInstall FAILED \(npm install exited with 1\); run `npm install` in the folder\.\n/);
  assert.ok(existsSync(path.join(w.cwd, 'site/.storybook/main.js')), 'the project stays');
  assert.match(run.out(), /Git: new repository \(branch main\), first commit [0-9a-f]{7}\./);
});

test('install never runs without Storybook, nor without --install', async () => {
  const { w, log, env } = await withFakeManager('npm');
  const without = plainIO(w.cwd, env);
  assert.equal(await runCreate({ folder: 'a', storybook: false, install: true, git: false }, without.io), 0);
  assert.doesNotMatch(without.out(), /Install/);
  assert.equal(await runCreate({ folder: 'b', storybook: true, git: false }, plainIO(w.cwd, env).io), 0);
  assert.deepEqual(await recorded(log), []);
});

test('a terminal asks «Install its npm packages now with <manager>?» only after Storybook', async () => {
  const { w, log, env } = await withFakeManager('pnpm');
  const pnpmEnv = { ...env, npm_config_user_agent: 'pnpm/10.33.0 npm/? node/v22.22.0' };
  const given = { template: 'minimal', react: false, git: false };
  const yes = terminalIO(w.cwd, pnpmEnv, [
    [/Add Storybook/, `y${KEY.enter}`],
    [/Install its npm packages now with pnpm\?/, `y${KEY.enter}`],
  ]);
  assert.equal(await runCreate({ folder: 'yes', ...given }, yes.io), 0, yes.err() + yes.screen());
  assert.equal(yes.answered(), 2);
  assert.deepEqual(await recorded(log), [`${path.join(w.cwd, 'yes')}|install`]);

  const defaultNo = terminalIO(w.cwd, env, [[/Add Storybook/, `y${KEY.enter}`], [/now with npm\?/, KEY.enter]]);
  assert.equal(await runCreate({ folder: 'no', ...given }, defaultNo.io), 0, defaultNo.err());
  assert.equal(defaultNo.answered(), 2, 'npm without npm_config_user_agent');
  assert.equal((await recorded(log)).length, 1, 'Enter: no install');

  const noStorybook = terminalIO(w.cwd, env, [[/Add Storybook/, KEY.enter]]);
  assert.equal(await runCreate({ folder: 'plain', ...given }, noStorybook.io), 0, noStorybook.err());
  assert.doesNotMatch(noStorybook.screen(), /Install its npm packages/);
});

test('through the CLI: --storybook and --no-storybook; --install', async () => {
  const { w, log, env } = await withFakeManager('npm');
  const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: w.cwd, encoding: 'utf8', env });
  assert.equal(cli('with', '--storybook', '--no-git').status, 0);
  assert.ok(existsSync(path.join(w.cwd, 'with/.storybook/main.js')));
  assert.equal(cli('without', '--no-storybook', '--no-git').status, 0);
  assert.ok(!existsSync(path.join(w.cwd, 'without/.storybook')));
  assert.deepEqual(await recorded(log), [], 'no install without --install');
  const installed = cli('installed', '--storybook', '--install', '--no-git');
  assert.equal(installed.status, 0, installed.stderr);
  assert.deepEqual(await recorded(log), [`${path.join(w.cwd, 'installed')}|install`]);
});
