// `npx @foliwake/next init` (runInit) against app folders in a temporary directory and a stub site: what it writes,
// idempotency, --dry-run, --json, --preview, --mount, next.config forms, refusals, exit codes and --check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { runInit } from '../packages/next/dist/init/run.js';
import { GENERATED } from '../packages/next/dist/init/templates.js';
import { CD, startStubOrigin } from './helpers/stub-origin.js';
import { discoveryDoc } from './fixtures/discovery.js';

const BLOCKS = 'entry="scripts/blocks.js", contract=2, prefix="demo"';

let site;
let oldSite;
const dirs = [];
before(async () => {
  const discovery = (origin) => (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(discoveryDoc({ site: 'demo', live: { url: origin() }, preview: null, media: null })));
  };
  site = await startStubOrigin({
    '/.well-known/foliwake.json': discovery(() => site.origin),
    '/index.plain.html': {
      headers: { 'content-type': 'text/html', 'x-code-release': CD, 'x-foliwake-blocks': BLOCKS },
    },
  });
  oldSite = await startStubOrigin({
    '/.well-known/foliwake.json': discovery(() => oldSite.origin),
    '/index.plain.html': { headers: { 'content-type': 'text/html' } },
  });
});
after(async () => {
  await site?.close();
  await oldSite?.close();
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A Next app folder: package.json, app/ (or src/app/), tsconfig unless js, and extra files. */
async function app({ next = '16.2.12', src = false, js = false, files = {} } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fw-init-'));
  dirs.push(dir);
  const deps = { next, react: '19.3.0', '@foliwake/next': '0.9.0' };
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'app', dependencies: deps }));
  await mkdir(path.join(dir, src ? 'src/app' : 'app'), { recursive: true });
  if (!js) await writeFile(path.join(dir, 'tsconfig.json'), '{}');
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
  return dir;
}

async function init(cwd, args, { env = {}, ask } = {}) {
  let stdout = '';
  let stderr = '';
  const io = { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t), env, cwd, ...(ask ? { ask } : {}) };
  const code = await runInit(['init', ...args], io);
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

/** Every file under `dir` with its text. */
async function tree(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)));
  return Object.fromEntries(
    await Promise.all(files.sort().map(async (f) => [f, await readFile(path.join(dir, f), 'utf8')])),
  );
}

const IMPORT = "import { withFoliwake } from '@foliwake/next/config';";
const read = (dir, file) => readFile(path.join(dir, file), 'utf8');

describe('a fresh TypeScript app', () => {
  test('writes env, next.config, the route and the page; --json reports each step', async () => {
    const dir = await app();
    const run = await init(dir, ['--url', site.origin, '--yes', '--json']);
    assert.equal(run.code, 0, run.stderr);
    const report = run.json();
    assert.equal(report.site, 'demo');
    assert.equal(report.blocks, BLOCKS);
    assert.deepEqual(
      report.steps.map((s) => [s.path, s.outcome]),
      [
        ['.env.local', 'created'],
        ['next.config.ts', 'created'],
        ['app/foliwake/[...path]/route.ts', 'created'],
        ['app/[...path]/page.tsx', 'created'],
      ],
    );
    assert.equal(await read(dir, '.env.local'), `FOLIWAKE_URL=${site.origin}\n`);
    assert.match(await read(dir, 'next.config.ts'), /export default withFoliwake\(\{ cacheComponents: true \}\);/);
    assert.equal(
      await read(dir, 'app/foliwake/[...path]/route.ts'),
      `${GENERATED}\nexport { GET, HEAD, POST } from '@foliwake/next/handler';\n`,
    );
    assert.equal(
      await read(dir, 'app/[...path]/page.tsx'),
      `${GENERATED}\nexport { default, generateMetadata } from '@foliwake/next/page';\n`,
    );
  });

  test('idempotent: a second run changes nothing and says "exists"', async () => {
    const dir = await app();
    assert.equal((await init(dir, ['--url', site.origin, '--yes'])).code, 0);
    const before = await tree(dir);
    const again = await init(dir, ['--url', site.origin, '--yes', '--json']);
    assert.equal(again.code, 0);
    assert.ok(
      again.json().steps.every((s) => s.outcome === 'exists'),
      again.stdout,
    );
    assert.deepEqual(await tree(dir), before);
  });

  test('--dry-run writes nothing and reports what would change', async () => {
    const dir = await app();
    const before = await tree(dir);
    const run = await init(dir, ['--url', site.origin, '--yes', '--dry-run']);
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /would be created/);
    assert.match(run.stdout, /Dry run: nothing was written\./);
    assert.deepEqual(await tree(dir), before);
  });

  test('the human report names the site and what to do next', async () => {
    const run = await init(await app(), ['--url', site.origin, '--yes']);
    assert.match(run.stdout, new RegExp(`^✓ ${site.origin}: site demo, plain/2, blocks entry="scripts/blocks\\.js"`));
    assert.match(run.stdout, /Next: Run the app/);
  });
});

describe('options', () => {
  test('--preview: preview page, dev-only isAuthor, the long handler; the token variable is empty', async () => {
    const dir = await app({ files: { '.env.example': 'OTHER=1\n' } });
    const run = await init(dir, ['--url', site.origin, '--yes', '--preview', '--hook']);
    assert.equal(run.code, 0, run.stderr);
    const route = await read(dir, 'app/foliwake/[...path]/route.ts');
    assert.match(route, /import \{ isAuthor \} from '\.\.\/\.\.\/\.\.\/foliwake\/is-author';/);
    assert.match(route, /createFoliwakeHandler\(\{ authorizePreview: isAuthor \}\)/);
    const preview = await read(dir, 'app/preview/[[...path]]/page.tsx');
    assert.match(preview, /channel: 'preview', authorize: isAuthor, mount: '\/preview'/);
    assert.match(await read(dir, 'foliwake/is-author.ts'), /process\.env\.NODE_ENV === 'development'/);
    const env = await read(dir, '.env.local');
    assert.match(env, /^FOLIWAKE_PREVIEW_TOKEN=$/m);
    assert.match(env, /^FOLIWAKE_HOOK_SECRET=$/m);
    assert.match(
      await read(dir, '.env.example'),
      /^OTHER=1\nFOLIWAKE_URL=.*\nFOLIWAKE_PREVIEW_TOKEN=\nFOLIWAKE_HOOK_SECRET=\n$/,
    );
    assert.match(run.stdout, /foliwake site preview-token --site demo/);
  });

  test('--mount /pages and a src/app JavaScript app', async () => {
    const dir = await app({ src: true, js: true });
    const run = await init(dir, ['--url', site.origin, '--yes', '--mount', '/pages', '--preview']);
    assert.equal(run.code, 0, run.stderr);
    assert.match(await read(dir, 'src/app/pages/[[...path]]/page.jsx'), /createFoliwakePage\(\{ mount: '\/pages' \}\)/);
    assert.ok(await read(dir, 'src/app/foliwake/[...path]/route.js'));
    assert.match(await read(dir, 'src/foliwake/is-author.js'), /export function isAuthor\(\) \{/);
    assert.match(
      await read(dir, 'src/app/preview/[[...path]]/page.jsx'),
      /from '\.\.\/\.\.\/\.\.\/foliwake\/is-author'/,
    );
    assert.ok(await read(dir, 'next.config.mjs'));
  });

  test('env equivalents: FOLIWAKE_INIT_URL and CI=1', async () => {
    const run = await init(await app(), [], { env: { FOLIWAKE_INIT_URL: site.origin, CI: '1' } });
    assert.equal(run.code, 0, run.stderr);
  });

  test('no URL: asked on a terminal; exit 2 with --yes or without one', async () => {
    const asked = await init(await app(), [], { ask: async () => site.origin });
    assert.equal(asked.code, 0, asked.stderr);
    const yes = await init(await app(), ['--yes']);
    assert.equal(yes.code, 2);
    assert.match(yes.stderr, /--url https:\/\//);
    assert.equal((await init(await app(), [])).code, 2);
  });
});

describe('existing files', () => {
  test('next.config by name and as an object literal: wrapped once, cacheComponents added', async () => {
    const byName = await app({
      files: {
        'next.config.ts': [
          "import type { NextConfig } from 'next';",
          '',
          'const config: NextConfig = { cacheComponents: true };',
          '',
          'export default config;',
          '',
        ].join('\n'),
      },
    });
    assert.equal((await init(byName, ['--url', site.origin, '--yes'])).code, 0);
    const wrapped = await read(byName, 'next.config.ts');
    assert.match(
      wrapped,
      /^import type \{ NextConfig \} from 'next';\nimport \{ withFoliwake \} from '@foliwake\/next\/config';/,
    );
    assert.match(wrapped, /export default withFoliwake\(config\);/);
    const object = await app({ files: { 'next.config.mjs': 'export default {\n  reactStrictMode: true,\n};\n' } });
    const run = await init(object, ['--url', site.origin, '--yes', '--json']);
    assert.match(
      await read(object, 'next.config.mjs'),
      /export default withFoliwake\(\{\n {2}cacheComponents: true,\n {2}reactStrictMode: true,\n\}\);/,
    );
    const steps = run.json().steps.filter((s) => s.path === 'next.config.mjs');
    assert.deepEqual(
      steps.map((s) => s.outcome),
      ['updated', 'updated'],
    );
    await init(object, ['--url', site.origin, '--yes']);
    assert.equal((await read(object, 'next.config.mjs')).match(/withFoliwake\(/g).length, 1);
  });

  test('cacheComponents: added to the create-next-app config, once; --dry-run and --json report it', async () => {
    const created = [
      "import type { NextConfig } from 'next';",
      '',
      'const nextConfig: NextConfig = {',
      '  /* config options here */',
      '};',
      '',
      'export default nextConfig;',
      '',
    ].join('\n');
    const dir = await app({ files: { 'next.config.ts': created } });
    const dry = await init(dir, ['--url', site.origin, '--yes', '--dry-run']);
    assert.match(dry.stdout, /next\.config\.ts +would be updated: cacheComponents: true/);
    assert.equal(await read(dir, 'next.config.ts'), created);
    const run = await init(dir, ['--url', site.origin, '--yes', '--json']);
    const cache = run.json().steps.find((s) => s.what.startsWith('cacheComponents'));
    assert.deepEqual([cache.path, cache.outcome], ['next.config.ts', 'updated']);
    assert.equal(run.json().ok, true);
    const edited = await read(dir, 'next.config.ts');
    assert.match(edited, /const nextConfig: NextConfig = \{\n {2}cacheComponents: true,\n {2}\/\* config options/);
    assert.match(edited, /export default withFoliwake\(nextConfig\);/);
    const again = await init(dir, ['--url', site.origin, '--yes', '--json']);
    assert.ok(
      again.json().steps.every((s) => s.outcome === 'exists'),
      again.stdout,
    );
    assert.equal(await read(dir, 'next.config.ts'), edited);
  });

  test('cacheComponents: one-line objects, an already wrapped config', async () => {
    const cases = [
      ['export default {};\n', 'export default withFoliwake({ cacheComponents: true });\n'],
      [
        'export default { reactStrictMode: true };\n',
        'export default withFoliwake({ cacheComponents: true, reactStrictMode: true });\n',
      ],
      [
        `${IMPORT}\nconst c = {};\nexport default withFoliwake(c);\n`,
        `${IMPORT}\nconst c = { cacheComponents: true };\nexport default withFoliwake(c);\n`,
      ],
    ];
    for (const [before, after] of cases) {
      const dir = await app({ files: { 'next.config.mjs': before } });
      assert.equal((await init(dir, ['--url', site.origin, '--yes'])).code, 0);
      assert.equal(await read(dir, 'next.config.mjs'), before.startsWith(IMPORT) ? after : `${IMPORT}\n${after}`);
    }
  });

  test('cacheComponents: other forms are left alone and the line to add is printed', async () => {
    const forms = [
      'import base from "./base.mjs";\nexport default base;\n',
      'export default { cacheComponents: false };\n',
    ];
    for (const text of forms) {
      const dir = await app({ files: { 'next.config.mjs': text } });
      const run = await init(dir, ['--url', site.origin, '--yes', '--json']);
      const cache = run.json().steps.find((s) => s.what.startsWith('cacheComponents'));
      assert.equal(cache.outcome, 'manual');
      assert.match(cache.note, /add `cacheComponents: true,` to the config/);
      assert.equal(run.json().ok, false);
      assert.doesNotMatch(await read(dir, 'next.config.mjs'), /cacheComponents: true/);
    }
  });

  test('CommonJS next.config: left alone, the steps printed', async () => {
    const dir = await app({ files: { 'next.config.js': 'module.exports = { cacheComponents: true };\n' } });
    const run = await init(dir, ['--url', site.origin, '--yes', '--json']);
    const step = run.json().steps.find((s) => s.path === 'next.config.js');
    assert.equal(step.outcome, 'manual');
    assert.match(step.note, /CommonJS/);
    assert.equal(await read(dir, 'next.config.js'), 'module.exports = { cacheComponents: true };\n');
    assert.equal(run.json().ok, false);
  });

  test('a page of the app is never overwritten; --force rewrites only generated files', async () => {
    const mine = 'export default function Page() { return null; }\n';
    const dir = await app({
      files: { 'app/[...path]/page.tsx': mine, 'app/foliwake/[...path]/route.ts': `${GENERATED}\n// old\n` },
    });
    const run = await init(dir, ['--url', site.origin, '--yes', '--json']);
    const outcomes = Object.fromEntries(run.json().steps.map((s) => [s.path, s.outcome]));
    assert.equal(outcomes['app/[...path]/page.tsx'], 'skipped');
    assert.equal(outcomes['app/foliwake/[...path]/route.ts'], 'skipped');
    const forced = await init(dir, ['--url', site.origin, '--yes', '--force', '--json']);
    const forcedOutcomes = Object.fromEntries(forced.json().steps.map((s) => [s.path, s.outcome]));
    assert.equal(forcedOutcomes['app/foliwake/[...path]/route.ts'], 'updated');
    assert.equal(forcedOutcomes['app/[...path]/page.tsx'], 'skipped');
    assert.equal(await read(dir, 'app/[...path]/page.tsx'), mine);
  });

  test('.env.local: missing names appended, existing values kept', async () => {
    const dir = await app({ files: { '.env.local': 'FOLIWAKE_URL=https://kept.example.org\nOTHER=x' } });
    await init(dir, ['--url', site.origin, '--yes', '--preview']);
    assert.equal(
      await read(dir, '.env.local'),
      'FOLIWAKE_URL=https://kept.example.org\nOTHER=x\nFOLIWAKE_PREVIEW_TOKEN=\n',
    );
  });
});

describe('refusals', () => {
  test('a site without X-Code-Release, or without discovery: exit 1, nothing written', async () => {
    const dir = await app();
    const before = await tree(dir);
    const old = await init(dir, ['--url', oldSite.origin, '--yes']);
    assert.equal(old.code, 1);
    assert.match(old.stderr, /without X-Code-Release/);
    const none = await init(dir, ['--url', `${site.origin.replace(/:\d+$/, ':9')}`, '--yes']);
    assert.equal(none.code, 1);
    assert.deepEqual(await tree(dir), before);
  });

  test('not a Next App Router app, or Next too old: exit 1', async () => {
    const pagesRouter = await app();
    await rm(path.join(pagesRouter, 'app'), { recursive: true });
    assert.match((await init(pagesRouter, ['--url', site.origin, '--yes'])).stderr, /needs the App Router/);
    const old = await init(await app({ next: '15.5.0' }), ['--url', site.origin, '--yes']);
    assert.equal(old.code, 1);
    assert.match(old.stderr, /Next 15\.5\.0 is too old/);
  });

  test('uncommitted git changes stop init unless --ignore-git-changes', async () => {
    const dir = await app();
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const dirty = await init(dir, ['--url', site.origin, '--yes']);
    assert.equal(dirty.code, 1);
    assert.match(dirty.stderr, /uncommitted changes/);
    assert.equal((await init(dir, ['--url', site.origin, '--yes', '--ignore-git-changes'])).code, 0);
  });

  test('bad flags: exit 1 with the problem; help: exit 0', async () => {
    const dir = await app();
    assert.equal((await init(dir, ['--nope'])).code, 1);
    assert.equal((await init(dir, ['--url', site.origin, '--yes', '--mount', 'pages'])).code, 1);
    let out = '';
    const help = await runInit(['--help'], { stdout: (t) => (out += t), stderr: () => {}, env: {}, cwd: dir });
    assert.equal(help, 0);
    assert.match(out, /Usage: npx @foliwake\/next init/);
  });
});

describe('--check', () => {
  test('after init: files, env and site pass; versions fail without node_modules; values never printed', async () => {
    const dir = await app();
    await init(dir, ['--url', site.origin, '--yes', '--preview']);
    await writeFile(path.join(dir, '.env.local'), `FOLIWAKE_URL=${site.origin}\nFOLIWAKE_PREVIEW_TOKEN=s3cr3t-value\n`);
    const run = await init(dir, ['--check', '--json']);
    assert.equal(run.code, 1);
    const checks = Object.fromEntries(run.json().checks.map((c) => [c.name, c.ok]));
    assert.equal(checks['next.config uses withFoliwake()'], true);
    assert.equal(checks['route handler'], true);
    assert.equal(checks['page route'], true);
    assert.equal(checks['FOLIWAKE_URL is set'], true);
    assert.equal(checks['FOLIWAKE_PREVIEW_TOKEN is set (preview route found)'], true);
    assert.equal(checks['@foliwake packages share one version'], false);
    assert.equal(checks[`${site.origin} answers discovery and plain/2`], true);
    assert.doesNotMatch(run.stdout, /s3cr3t-value/);
  });

  test('an empty app: every file check fails, exit 1', async () => {
    const run = await init(await app(), ['--check']);
    assert.equal(run.code, 1);
    assert.match(run.stdout, /✗ route handler/);
  });
});
