// @foliwake/site-check/formats: the diagnostic form, the layout of site code, positions of JSON pointers, and the
// rule that the format modules import nothing of Node (the origin and the edge Worker import them).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { extensionOf, isCodeExtension } from '@foliwake/site-check/formats/code-files';
import {
  compareDiagnostics,
  formatDiagnostic,
  makeDiagnostic,
  severityOf,
  sortDiagnostics,
  suggestName,
} from '@foliwake/site-check/formats/diagnostics';
import { jsonPointerPosition } from '@foliwake/site-check/formats/json-position';
import {
  isCapturedInput,
  isCodeInput,
  isExampleFile,
  isGeneratedPath,
  isLicenseFile,
  isUnderCodeRoot,
} from '@foliwake/site-check/formats/layout';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMATS = path.join(ROOT, 'packages/site-check/src/formats');

test('formatDiagnostic gives the terminal form (ported from the engine)', () => {
  const diagnostic = {
    code: 'COMPONENT_FIELD_UNKNOWN',
    severity: 'error',
    file: 'content/questions.md',
    line: 12,
    column: 5,
    component: 'accordion',
    field: 'items[0].titel',
    message: 'Unknown field "titel" in accordion item.',
    fix: 'Did you mean "title"? Allowed item fields: title, answer.',
  };
  assert.equal(
    formatDiagnostic(diagnostic),
    'content/questions.md:12:5 error COMPONENT_FIELD_UNKNOWN accordion items[0].titel: ' +
      'Unknown field "titel" in accordion item.\n' +
      '    fix: Did you mean "title"? Allowed item fields: title, answer.',
  );
  const warning = { ...diagnostic, component: null, field: null, fix: null, severity: 'warning' };
  assert.equal(
    formatDiagnostic({ ...warning, code: 'CONTENT_HEADING_SKIP', message: 'm' }),
    'content/questions.md:12:5 warning CONTENT_HEADING_SKIP: m',
  );
});

test('makeDiagnostic: every key in contract order, the severity from the catalogue', () => {
  const made = makeDiagnostic({ code: 'CODE_PATH_IGNORED', file: 'styles/x.scss', message: 'm' });
  const keys = ['code', 'severity', 'file', 'line', 'column', 'component', 'field', 'message', 'fix'];
  assert.deepEqual(Object.keys(made), keys);
  assert.equal(made.severity, 'info');
  assert.equal(severityOf('CODE_ASSET_UNDECLARED'), 'warning');
  assert.equal(severityOf('CODE_FILE_TOO_LARGE'), 'warning');
  assert.equal(severityOf('CODE_RELEASE_TOO_LARGE'), 'warning');
  assert.equal(severityOf('CODE_FILE_REQUIRED'), 'error');
  assert.equal(severityOf('ANY_OTHER_CODE'), 'error');
});

test('diagnostics sort by file, line, column, then code, field and message', () => {
  const at = (file, line, code) => makeDiagnostic({ code, file, line, message: code });
  const sorted = sortDiagnostics([at('b', 1, 'A'), at('a', 2, 'A'), at('a', 1, 'B'), at('a', 1, 'A')]);
  assert.deepEqual(
    sorted.map((d) => `${d.file}:${d.line}:${d.code}`),
    ['a:1:A', 'a:1:B', 'a:2:A', 'b:1:A'],
  );
  assert.equal(compareDiagnostics(at('a', 1, 'A'), at('a', 1, 'A')), 0);
  assert.equal(suggestName('titel', ['title', 'text']), 'title');
  assert.equal(suggestName('zzzz', ['title']), null);
});

test('layout: captured inputs are the code roots with code extensions, examples, and three root files', () => {
  for (const file of [
    'components/quiz/quiz.json',
    'components/quiz/quiz.example.md',
    'scripts/components.js',
    'styles/fonts/a.woff2',
    'templates/lesson/lesson.css',
    'references/signs.json',
    'site.yaml',
    'query.yaml',
    'access.yaml',
  ]) {
    assert.ok(isCapturedInput(file), file);
  }
  for (const file of [
    'content/index.md',
    'README.md',
    'styles/x.scss',
    'components/foo/Foo.JSON',
    'scripts/.hidden.js',
    'components/.cache/x.js',
    'scripts/old.ts',
    'blocks.json',
    'components/a/b.example.md',
    'nested/site.yaml',
  ]) {
    assert.ok(!isCapturedInput(file), file);
  }
  assert.ok(isUnderCodeRoot('styles/x.scss'));
  assert.ok(!isUnderCodeRoot('styles'));
  assert.ok(!isCodeInput('site.yaml'));
  assert.ok(isExampleFile('components/note/note.example.md'));
  assert.ok(!isExampleFile('components/note/other.example.md'));
  assert.ok(isGeneratedPath('shell.json') && isGeneratedPath('_foliwake/block-kit.js'));
  assert.ok(!isGeneratedPath('styles/styles.css'));
});

test('license and notice files next to code are recognised; code files are not', () => {
  for (const file of ['scripts/vendor/react.LICENSE.txt', 'scripts/vendor/LICENSE', 'styles/fonts/NOTICE.md']) {
    assert.ok(isLicenseFile(file), file);
  }
  for (const file of ['scripts/license.js', 'styles/licenses.css', 'scripts/vendor/react.js']) {
    assert.ok(!isLicenseFile(file), file);
  }
});

test('extensionOf agrees with path.posix.extname; code extensions are matched as written', () => {
  const names = ['a.js', 'a/b.css', '.gitignore', 'a', 'a.', 'a.b.c', 'dir.x/file', '..', '...', 'a/.b', 'x.WOFF2'];
  for (const name of names) assert.equal(extensionOf(name), path.posix.extname(name), name);
  assert.ok(isCodeExtension('.woff2'));
  assert.ok(!isCodeExtension('.WOFF2'));
});

test('jsonPointerPosition: object members at their key, items at their value, the deepest found part otherwise', () => {
  const text =
    '{\n  "label": {"en": "Quiz"},\n  "fields": [\n    {"name": "q", "type": "text"},\n' +
    '    {"name": "a/b", "type": "choice"}\n  ]\n}\n';
  assert.deepEqual(jsonPointerPosition(text, ''), { line: 1, column: 1 });
  assert.deepEqual(jsonPointerPosition(text, '/label/en'), { line: 2, column: 13 });
  assert.deepEqual(jsonPointerPosition(text, '/fields/1'), { line: 5, column: 5 });
  assert.deepEqual(jsonPointerPosition(text, '/fields/1/type'), { line: 5, column: 21 });
  assert.deepEqual(jsonPointerPosition(text, '/fields/1/missing'), { line: 5, column: 5 });
  assert.deepEqual(jsonPointerPosition(text, '/fields/7/type'), { line: 3, column: 3 });
  assert.deepEqual(jsonPointerPosition('{"a~/b": 1, "x": {"y": "}"}, "z": 2}', '/z'), { line: 1, column: 30 });
  assert.deepEqual(jsonPointerPosition('{"a/b": 1}', '/a~1b'), { line: 1, column: 2 });
  assert.deepEqual(jsonPointerPosition('not json', '/a'), { line: 1, column: 1 });
  assert.deepEqual(jsonPointerPosition('{"é": {"b": 1}}', '/é/b'), { line: 1, column: 8 });
});

test('formats/* import nothing of Node and no other module of the package', () => {
  for (const name of readdirSync(FORMATS)) {
    const text = readFileSync(path.join(FORMATS, name), 'utf8');
    const specifiers = [...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((match) => match[1]);
    for (const specifier of specifiers) {
      const allowed = specifier === 'yaml' || /^\.\/[a-z-]+\.js$/.test(specifier);
      assert.ok(allowed, `formats/${name} imports ${specifier}`);
    }
    assert.doesNotMatch(text, /\b(Buffer|process|NodeJS)\b/, `formats/${name} uses a Node global`);
  }
});
