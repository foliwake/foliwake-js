// The CLI `foliwake-site-check`: its text, JSON and GitHub output, --strict and --quiet, and its exit status
// (0 no errors, 1 errors, 2 usage), through runCli and through the installed bin.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, test } from 'node:test';

import { runCli } from '@foliwake/site-check/cli';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'packages/site-check/dist/bin.js');
const MANIFEST = path.join(ROOT, 'packages/site-check/package.json');
const VERSION = JSON.parse(readFileSync(MANIFEST, 'utf8')).version;
const CLOSING =
  'Block examples and pages are rendered only by the engine: ' +
  '`foliwake page check` locally, or the branch preview on the platform.';
const ROOTS = 'components/, scripts/, styles/, templates/, references/, query.yaml, access.yaml, site.yaml';

const folders = [];
after(() => Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true }))));

const CLEAN_SITE = {
  'scripts/components.js': 'export {};\n',
  'styles/styles.css': 'body { margin: 0; }\n',
  'components/note/note.json': '{\n  "fields": [{ "name": "text", "type": "text" }]\n}\n',
  'components/note/note.css': '.note { color: black; }\n',
};

async function site(files) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'site-check-cli-'));
  folders.push(folder);
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(folder, file)), { recursive: true });
    await writeFile(path.join(folder, file), text);
  }
  return folder;
}

const BROKEN_SITE = {
  ...CLEAN_SITE,
  'components/note/note.json': '{\n  "fields": [{ "name": "q", "type": "choice" }]\n}\n',
  'styles/styles.css': 'body { margin: 0; }\n.a { background: url("../fonts/x.woff2"); }\n',
  'scripts/old.ts': 'x\n',
};

async function run(args, cwd) {
  const out = [];
  const err = [];
  const status = await runCli(args, { cwd, out: (text) => out.push(text), err: (text) => err.push(text) });
  return { status, out: out.join('\n').split('\n'), err: err.join('\n') };
}

test('a clean site: header, summary, closing line, exit 0', async () => {
  const { status, out } = await run([], await site(CLEAN_SITE));
  assert.equal(status, 0);
  assert.deepEqual(out, [
    `@foliwake/site-check ${VERSION} — site code in . (HTML contract 2)`,
    `4 files would be captured (${ROOTS}): 0 errors, 0 warnings, 0 notes.`,
    CLOSING,
  ]);
});

test('problems: one diagnostic per line in the terminal form, the counts, exit 1', async () => {
  const { status, out } = await run(['.'], await site(BROKEN_SITE));
  assert.equal(status, 1);
  assert.deepEqual(out.slice(1), [
    'components/note/note.json:2:29 error BLOCKS_PACK_INVALID note /fields/0/type: Unknown field type "choice".',
    '    fix: Use one of: text, heading, list, choices, quote, image.',
    'scripts/old.ts:1:1 info CODE_PATH_IGNORED: .ts is not a code file type; the platform never captures this file.',
    '    fix: Rename or move it if a page needs it; otherwise ignore this note.',
    'styles/styles.css:2:18 error CODE_REFERENCE_MISSING: reference "../fonts/x.woff2" resolves to fonts/x.woff2, ' +
      'which is not in the release',
    '    fix: Add the file to the site code (and commit it), or fix the path.',
    `4 files would be captured (${ROOTS}): 2 errors, 0 warnings, 1 note.`,
    CLOSING,
  ]);
});

test('--quiet: no header, notes or closing line', async () => {
  const { out } = await run(['--quiet'], await site(BROKEN_SITE));
  assert.equal(out.length, 5);
  assert.ok(out.every((line) => !line.includes('CODE_PATH_IGNORED') && line !== CLOSING));
});

test('--strict: a warning fails too', async () => {
  const big = { ...CLEAN_SITE, 'components/note/note.css': `/* ${'x'.repeat(2 * 1024 * 1024)} */\n` };
  const folder = await site(big);
  assert.equal((await run([], folder)).status, 0);
  const strict = await run(['--strict'], folder);
  assert.equal(strict.status, 1);
  assert.ok(strict.out.some((line) => line.includes('warning CODE_FILE_TOO_LARGE')));
});

test('--json: one object of the documented shape', async () => {
  const folder = await site(BROKEN_SITE);
  const { status, out } = await run(['--json'], folder);
  assert.equal(status, 1);
  const report = JSON.parse(out.join('\n'));
  const keys = ['schema', 'version', 'htmlContract', 'root', 'captured', 'ignored', 'diagnostics'];
  assert.deepEqual(Object.keys(report), [...keys, 'errors', 'warnings', 'notes']);
  assert.equal(report.schema, 'foliwake-site-check/1');
  assert.equal(report.root, folder);
  assert.deepEqual([report.errors, report.warnings, report.notes], [2, 0, 1]);
  assert.deepEqual(report.ignored, [{ file: 'scripts/old.ts', reason: '.ts is not a code file type' }]);
  assert.deepEqual((await run(['--format', 'json'], folder)).out, out);
});

test('--format github: workflow commands with escaped properties and message', async () => {
  const { out } = await run(['--format=github'], await site(BROKEN_SITE));
  assert.equal(
    out[0],
    '::error file=components/note/note.json,line=2,col=29,title=BLOCKS_PACK_INVALID::' +
      'note /fields/0/type: Unknown field type "choice".' +
      '%0Afix: Use one of: text, heading, list, choices, quote, image.',
  );
  assert.match(out[1], /^::notice file=scripts\/old\.ts,line=1,col=1,title=CODE_PATH_IGNORED::/);
  assert.match(out.at(-1), /2 errors, 0 warnings, 1 note\.$/);
});

test('usage errors exit 2 and print the usage', async () => {
  const folder = await site(CLEAN_SITE);
  for (const args of [['--nope'], ['--format', 'xml'], ['missing-folder'], ['a', 'b'], ['scripts/components.js']]) {
    const { status, err } = await run(args, folder);
    assert.equal(status, 2, args.join(' '));
    assert.match(err, /^foliwake-site-check: .+\n\nUsage: foliwake-site-check/, args.join(' '));
  }
});

test('the bin: exit status and --version', async () => {
  const exec = promisify(execFile);
  assert.equal((await exec(process.execPath, [BIN, '--version'])).stdout, `${VERSION}\n`);
  await exec(process.execPath, [BIN, await site(CLEAN_SITE)]);
  const broken = await site(BROKEN_SITE);
  await assert.rejects(exec(process.execPath, [BIN, broken]), (error) => error.code === 1);
  await assert.rejects(exec(process.execPath, [BIN, '--bad']), (error) => error.code === 2);
});
