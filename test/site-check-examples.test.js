// The block example file format (split at `<!-- example: … -->` markers, ids, the intro, the file's problems)
// and the structural example checks of a code release; ported from the engine's tests (behaviour parity).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkCodeRelease } from '@foliwake/site-check';
import {
  exampleFileOf,
  isExampleFile,
  isExampleId,
  parseExampleFile,
} from '@foliwake/site-check/blocks/examples';

/** The position fields of the examples of a file. */
const placesOf = (file) => file.examples.map(({ id, title, line }) => ({ id, title, line }));

/** Each example's id and the code and line of its own problems. */
const problemsById = (file) => file.examples.map((e) => [e.id, e.problems.map((p) => [p.code, p.line])]);

test('the file of a block and which paths are example files', () => {
  assert.equal(exampleFileOf('note'), 'components/note/note.example.md');
  assert.ok(isExampleFile('components/note/note.example.md'));
  const others = [
    'components/note/other.example.md',
    'components/note/note.md',
    'content/note.example.md',
    'components/Note/Note.example.md',
    'components/note/sub/note.example.md',
  ];
  for (const file of others) assert.ok(!isExampleFile(file), file);
});

test('examples are split at `<!-- example: … -->` lines; the text before the first is the intro', () => {
  const text = [
    '# Note\n\nA remark.\n\n',
    '<!-- example: Text only -->\n\n:::note\n\nHello.\n\n:::\n\n',
    '<!-- example: With a title {#titled} -->\n\n:::note\n\n### T\n\nX.\n\n:::\n',
  ].join('');
  const file = parseExampleFile(text);
  assert.equal(file.intro, '# Note\n\nA remark.\n\n');
  assert.deepEqual(placesOf(file), [
    { id: 'text-only', title: 'Text only', line: 6 },
    { id: 'titled', title: 'With a title', line: 14 },
  ]);
  assert.equal(file.examples[0].markdown, '\n:::note\n\nHello.\n\n:::\n\n');
  assert.equal(text.split('\n')[file.examples[1].line], ':::note', 'line is where the example Markdown starts');
  assert.deepEqual(file.problems, []);
});

test('markers inside fenced code and headings of any level do not split; no marker means one example', () => {
  const fenced = parseExampleFile(
    '<!-- example: One -->\n\n```md\n<!-- example: not a heading -->\n```\n\n### Sub\n\ntext\n',
  );
  assert.deepEqual(fenced.examples.map((e) => e.title), ['One']);
  const single = parseExampleFile(':::note\n\nHello.\n\n:::\n');
  assert.deepEqual(placesOf(single), [{ id: 'example', title: 'Example', line: 1 }]);
  assert.equal(single.intro, '');
});

test('ids: slugs, closing #s, a fallback for titles without letters, and the file problems', () => {
  const file = parseExampleFile(
    '<!-- example: Ünïcode Title! -->\n\nx\n\n<!-- example: 123 -->\n\ny\n\n<!-- example: ¿¡ -->\n\nz\n',
  );
  assert.deepEqual(file.examples.map((e) => [e.id, e.title]), [
    ['unicode-title', 'Ünïcode Title!'],
    ['example-123', '123'],
    ['example-3', '¿¡'],
  ]);
  const valid = file.examples.every((e) => isExampleId(e.id) && e.problems.length === 0);
  assert.ok(valid, 'ids made from titles are always valid');
  const bad = parseExampleFile(
    [
      '<!-- example: A {#same} -->\n\nx\n\n',
      '<!-- example: B {#same} -->\n\ny\n\n',
      '<!-- example: C {#Bad_Id} -->\n\nz\n\n',
      '<!-- example: D {#../../victim} -->\n\nw\n\n',
      '<!-- example: Empty -->\n',
    ].join(''),
  );
  assert.deepEqual(problemsById(bad), [
    ['same', []],
    ['same', [['EXAMPLE_ID_DUPLICATE', 5]]],
    ['Bad_Id', [['EXAMPLE_ID_INVALID', 9]]],
    ['../../victim', [['EXAMPLE_ID_INVALID', 13]]],
    ['empty', [['EXAMPLE_EMPTY', 17]]],
  ]);
  assert.deepEqual(bad.problems, [], 'problems of an example belong to it');
  assert.deepEqual(parseExampleFile('  \n').problems.map((p) => p.code), ['EXAMPLE_EMPTY']);
});

test('a block whose field is a ## heading can have examples', () => {
  const file = parseExampleFile(
    [
      '# Casualty fix\n\n',
      '<!-- example: Basic -->\n:::casualty-fix\n\n## What do you do first?\n\nCall for help.\n\n:::\n\n',
      '<!-- example:   -->\n\n## Not a separator\n',
    ].join(''),
  );
  assert.deepEqual(placesOf(file), [
    { id: 'basic', title: 'Basic', line: 4 },
    { id: 'example-2', title: 'Example 2', line: 13 },
  ]);
  assert.match(file.examples[0].markdown, /^:::casualty-fix\n\n## What do you do first\?/);
  assert.equal(parseExampleFile('<!-- example: {#only-id} -->\n\nx\n').examples[0].id, 'only-id');
  const inline = parseExampleFile('Text <!-- example: inline --> x\n');
  assert.equal(inline.examples.length, 1, 'a marker is a line of its own');
});

test('marker edges: trailing blanks are allowed; a title never swallows `-->`', () => {
  assert.deepEqual(parseExampleFile('<!-- example: A -->   \n\nx\n').examples.map((e) => e.title), ['A']);
  const glued = parseExampleFile('<!-- example: A --> <!-- x -->\n\nx\n');
  assert.deepEqual(
    glued.examples.map((e) => [e.id, e.title]),
    [['example', 'Example']],
    'not a marker: the line stays content (raw HTML, refused when rendered)',
  );
  assert.equal(parseExampleFile('<!--example:B-->\n\ny\n').examples[0].title, 'B');
});

// The structural example checks of a code release (rendering the examples is the engine's).

const NOTE = { fields: [{ name: 'text', type: 'text' }] };

/** The files of a code release with a `note` block and `extra` files (path → text). */
function releaseFiles(extra = {}) {
  const files = new Map([
    ['scripts/components.js', 'export {};\n'],
    ['styles/styles.css', ''],
    ['components/note/note.json', JSON.stringify(NOTE)],
    ['components/note/note.css', ''],
    ...Object.entries(extra),
  ]);
  return new Map([...files].map(([file, text]) => [file, new TextEncoder().encode(text)]));
}

/** The errors of a code release as `CODE file:line`. */
async function releaseErrors(extra) {
  const { diagnostics } = await checkCodeRelease(releaseFiles(extra));
  return diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code} ${d.file}:${d.line}`);
}

test('a release with well-formed examples of its blocks has no errors', async () => {
  const examples = '<!-- example: One -->\n\n:::note\n\nHello.\n\n:::\n';
  assert.deepEqual(await releaseErrors({ 'components/note/note.example.md': examples }), []);
});

test('an invalid or repeated example id and an empty example refuse the release, at their lines', async () => {
  const examples = [
    '<!-- example: Escape {#../../victim} -->\n\n:::note\n\nA.\n\n:::\n\n',
    '<!-- example: One {#same} -->\n\n:::note\n\nB.\n\n:::\n\n',
    '<!-- example: Two {#same} -->\n\n:::note\n\nC.\n\n:::\n\n',
    '<!-- example: Empty -->\n',
  ].join('');
  const file = 'components/note/note.example.md';
  assert.deepEqual(await releaseErrors({ [file]: examples }), [
    `EXAMPLE_ID_INVALID ${file}:1`,
    `EXAMPLE_ID_DUPLICATE ${file}:17`,
    `EXAMPLE_EMPTY ${file}:25`,
  ]);
  assert.deepEqual(await releaseErrors({ [file]: '  \n' }), [`EXAMPLE_EMPTY ${file}:1`]);
});

test('an example file of a folder without a block definition refuses the release (EXAMPLE_BLOCK_UNKNOWN)', async () => {
  const orphan = {
    'components/ghost/ghost.example.md': '<!-- example: G -->\n\n:::ghost\n\nx\n\n:::\n',
    'components/ghost/ghost.css': '',
  };
  const { diagnostics } = await checkCodeRelease(releaseFiles(orphan));
  const unknown = diagnostics.filter((d) => d.code === 'EXAMPLE_BLOCK_UNKNOWN');
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].file, 'components/ghost/ghost.example.md');
  assert.equal(unknown[0].component, 'ghost');
  assert.equal(unknown[0].severity, 'error');
  assert.match(unknown[0].message, /no block "ghost" \(components\/ghost\/ghost\.json\) for this example/);
});
