// checkSiteCode over a working folder and checkCodeRelease over captured files: what is captured or ignored,
// the engine's own files, block folder names, the limits of site code, and the form and order of diagnostics.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { checkCodeRelease, checkSiteCode } from '@foliwake/site-check';
import { compareDiagnostics } from '@foliwake/site-check/formats/diagnostics';

const dirs = [];
after(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

const KEYS = ['code', 'severity', 'file', 'line', 'column', 'component', 'field', 'message', 'fix'];
const NOTE = JSON.stringify({ fields: [{ name: 'text', type: 'text' }] });
const KIT_IMPORT = "import { defineBlock } from '@foliwake/block-kit';\n"
  + "export default defineBlock('note', () => {});\n";
const BASE = {
  'scripts/components.js': 'export {};\n',
  'styles/styles.css': 'body { margin: 0; }\n',
  'components/note/note.json': NOTE,
};

async function tmp() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fw-site-check-'));
  dirs.push(dir);
  return dir;
}

async function writeAll(dir, files) {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
}

/** A folder holding `files`. */
async function folderWith(files) {
  const dir = await tmp();
  await writeAll(dir, files);
  return dir;
}

/** Captured files (path → bytes) from texts or buffers. */
function filesOf(entries) {
  return new Map(Object.entries(entries).map(([file, value]) => [file, Buffer.from(value)]));
}

const errorsOf = (result) => result.diagnostics.filter((d) => d.severity === 'error');
const withCode = (result, code) => result.diagnostics.filter((d) => d.code === code);
const mentions = (result, prefix) =>
  [...result.captured, ...result.ignored.map((i) => i.file), ...result.diagnostics.map((d) => d.file)].filter(
    (file) => file.startsWith(prefix),
  );

describe('checkSiteCode: what a capture takes from a working folder', () => {
  async function messyFolder() {
    const dir = await folderWith({
      ...BASE,
      'styles/x.scss': '$a: 1;\n',
      'styles/.DS_Store': 'litter',
      'components/foo/Foo.JSON': '{}',
      'components/.cache/a.js': 'export {};\n',
      'components/.cache/b.js': 'export {};\n',
      'content/index.md': '---\nid: home\n---\n# Home\n',
      'README.md': '# Site\n',
    });
    const outside = await folderWith({ 'secret.js': "import x from 'lodash';\n" });
    await symlink(path.join(outside, 'secret.js'), path.join(dir, 'components/note/link.js'));
    return dir;
  }

  test('captured files are the code inputs; the rest under the code roots is ignored, with a reason', async () => {
    const result = await checkSiteCode(await messyFolder());
    assert.deepEqual(errorsOf(result), []);
    assert.deepEqual(result.captured, ['components/note/note.json', 'scripts/components.js', 'styles/styles.css']);
    assert.deepEqual(result.ignored, [
      { file: 'components/.cache/', reason: 'a hidden folder is never captured' },
      { file: 'components/foo/Foo.JSON', reason: '.JSON is not a code file type' },
      { file: 'components/note/link.js', reason: 'a symbolic link is never captured' },
      { file: 'styles/x.scss', reason: '.scss is not a code file type' },
    ]);
  });

  test('each ignored file is one CODE_PATH_IGNORED note', async () => {
    const result = await checkSiteCode(await messyFolder());
    const notes = withCode(result, 'CODE_PATH_IGNORED');
    assert.deepEqual(
      notes.map((d) => [d.file, d.severity]),
      result.ignored.map((i) => [i.file, 'info']),
    );
    const scss = notes.find((d) => d.file === 'styles/x.scss');
    assert.equal(scss.message, '.scss is not a code file type; the platform never captures this file.');
  });

  test('a symbolic link is not followed; .DS_Store, content/ and README.md are not reported', async () => {
    const result = await checkSiteCode(await messyFolder());
    assert.deepEqual(withCode(result, 'CODE_REFERENCE_NOT_RELATIVE'), [], 'the link target is never scanned');
    assert.deepEqual(mentions(result, 'styles/.DS_Store'), []);
    assert.deepEqual(mentions(result, 'content/'), []);
    assert.deepEqual(mentions(result, 'README.md'), []);
  });

  test('a block folder with an invalid name is CODE_FOLDER_NAME_INVALID', async () => {
    const result = await checkSiteCode(await folderWith({ ...BASE, 'components/Foo/Foo.css': '' }));
    const [folder] = withCode(result, 'CODE_FOLDER_NAME_INVALID');
    assert.equal(folder.file, 'components/Foo');
    assert.equal(folder.severity, 'error');
    assert.equal(folder.message, '"Foo" is not a block name, so this folder is never read as a block.');
  });

  test('`import … from "@foliwake/block-kit"` in a script is accepted: the engine adds the kit', async () => {
    const result = await checkSiteCode(await folderWith({ ...BASE, 'components/note/note.js': KIT_IMPORT }));
    assert.deepEqual(errorsOf(result), []);
  });
});

describe('checkCodeRelease: the engine files and the limits', () => {
  test('a file under _foliwake/ is generated, except the engine files themselves', async () => {
    const result = await checkCodeRelease(
      filesOf({ ...BASE, '_foliwake/other.js': 'export {};\n', '_foliwake/block-kit.js': 'export {};\n' }),
    );
    assert.deepEqual(
      withCode(result, 'CODE_FILE_GENERATED').map((d) => [d.file, d.severity]),
      [['_foliwake/other.js', 'error']],
    );
    assert.equal(result.captured.some((file) => file.startsWith('_foliwake/')), false);
  });

  test('the kit\'s specifier `@foliwake/block-kit` is accepted without the kit among the inputs', async () => {
    const result = await checkCodeRelease(filesOf({ ...BASE, 'components/note/note.js': KIT_IMPORT }));
    assert.deepEqual(errorsOf(result), []);
    for (const specifier of ['@foliwake/other', 'foliwake']) {
      const other = KIT_IMPORT.replace("'@foliwake/block-kit'", `'${specifier}'`);
      const refused = await checkCodeRelease(filesOf({ ...BASE, 'components/note/note.js': other }));
      assert.deepEqual(withCode(refused, 'CODE_REFERENCE_NOT_RELATIVE').length, 1, specifier);
    }
  });

  test('a file over 2 MiB is CODE_FILE_TOO_LARGE, a warning', async () => {
    const files = filesOf(BASE);
    files.set('components/note/big.png', Buffer.alloc(3 * 1024 * 1024));
    const result = await checkCodeRelease(files);
    assert.deepEqual(errorsOf(result), []);
    assert.deepEqual(
      withCode(result, 'CODE_FILE_TOO_LARGE').map((d) => [d.file, d.severity]),
      [['components/note/big.png', 'warning']],
    );
  });

  test('more than 2000 files is CODE_RELEASE_TOO_LARGE, a warning', async () => {
    const files = filesOf(BASE);
    for (let i = files.size; i < 2001; i += 1) files.set(`styles/part-${i}.css`, Buffer.from('a{}\n'));
    const result = await checkCodeRelease(files);
    assert.deepEqual(errorsOf(result), []);
    const [release] = withCode(result, 'CODE_RELEASE_TOO_LARGE');
    assert.equal(release.file, '.');
    assert.equal(release.severity, 'warning');
    assert.match(release.message, /^The code has 2001 files and \d+ bytes; at most 2000 files and 30 MiB\.$/);
  });
});

describe('the form of diagnostics', () => {
  async function manyProblems() {
    return checkCodeRelease(
      filesOf({
        'components/note/note.json': '{',
        'components/Bad/Bad.css': '',
        'styles/x.scss': '',
        'styles/styles.css': '@import "../../outside.css";\n.a { background: url("missing.png"); }\n',
        'query.yaml': 'version: 2\n',
        'blocks.json': '{}',
      }),
    );
  }

  test('diagnostics are sorted by file, line and column', async () => {
    const { diagnostics } = await manyProblems();
    assert.ok(diagnostics.length >= 6, JSON.stringify(diagnostics));
    assert.deepEqual(diagnostics, [...diagnostics].sort(compareDiagnostics));
  });

  test('every diagnostic has exactly the nine keys, in order', async () => {
    const { diagnostics } = await manyProblems();
    for (const diagnostic of diagnostics) assert.deepEqual(Object.keys(diagnostic), KEYS, diagnostic.code);
  });
});
