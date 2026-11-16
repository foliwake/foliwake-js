// Reference tables `references/<kind>.json` of site code: their format, images and limits, read from a working
// folder and from the captured files of a code release. Ported from the engine's tests (behaviour parity).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { checkCodeRelease } from '@foliwake/site-check';
import { isCodeInput } from '@foliwake/site-check/formats/layout';
import { REFERENCE_LIMITS } from '@foliwake/site-check/references/tables';
import { readSiteCode } from '@foliwake/site-check/site-code';

const dirs = [];
after(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>';
const SIGN = {
  schema: 'foliwake-references/1',
  render: 'image',
  pattern: '^[0-9A-Z]+(?:\\.[0-9]+)*$',
  by: 'country',
  sets: {
    ge: {
      2.3: {
        image: 'sign/ge/2.3.svg',
        name: { ru: 'Пересечение со второстепенной дорогой', en: 'Crossing with a minor road' },
        width: 700,
        height: 700,
      },
      'H1.1': { image: 'sign/ge/H1.1.svg', name: { ru: 'Разметка' } },
    },
    az: { '7.3.1': { image: 'sign/global/8.3.1.svg', name: { ru: 'Направления движения' } } },
  },
};
const LAW = {
  schema: 'foliwake-references/1',
  render: 'term',
  pattern: '^article_[0-9]+(?:_[0-9a-z]+)*$',
  by: 'country',
  sets: {
    ge: {
      article_29_10: { label: { ru: 'Ст. 29, п. 10' }, title: { ru: 'Светофор' } },
      article_1: { label: { ru: 'Ст. 1' }, href: '/law#article-1' },
    },
  },
};
const BASE_FILES = {
  'references/sign.json': JSON.stringify(SIGN),
  'references/law.json': JSON.stringify(LAW),
  'references/sign/ge/2.3.svg': SVG,
  'references/sign/ge/H1.1.svg': SVG,
  'references/sign/global/8.3.1.svg': SVG,
};
const NOTE = {
  label: { ru: 'Заметка' },
  fields: [
    { name: 'title', type: 'heading', level: 3 },
    { name: 'items', type: 'list' },
  ],
};

async function tmp() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fw-references-'));
  dirs.push(dir);
  return dir;
}

const present = (files) => Object.entries(files).filter(([, value]) => value !== undefined);

async function writeAll(dir, files) {
  for (const [file, text] of present(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
}

/** A diagnostic in the engine's one-line issue form: code, file and JSON pointer, message. */
const issueLine = (d) => `${d.code} ${d.file}${d.field ?? ''}: ${d.message}`;

describe('tables and their limits', () => {
  async function issuesOf(files) {
    const dir = await tmp();
    await writeAll(dir, files);
    const code = await readSiteCode(dir);
    return { code, issues: code.diagnostics.map(issueLine) };
  }
  const table = (over) => JSON.stringify({ ...SIGN, ...over });

  test('a valid table is read; one file declares one kind, nothing else does', async () => {
    const { code, issues } = await issuesOf(BASE_FILES);
    assert.deepEqual(issues, []);
    assert.deepEqual([...code.references.keys()], ['law', 'sign']);
    assert.equal(code.references.get('sign').by, 'country');
    assert.equal((await issuesOf({})).code.references, null);
  });

  test('format problems are REFERENCES_TABLE_INVALID with the file and a JSON pointer', async () => {
    const cases = [
      [table({ schema: 'x' }), /\/schema: "schema" must be "foliwake-references\/1"/],
      [table({ render: 'html' }), /\/render: "render" must be "image" or "term"/],
      [table({ pattern: '(' }), /\/pattern: "pattern" is not a valid regular expression/],
      [
        table({ pattern: `^${'a'.repeat(REFERENCE_LIMITS.patternLength)}$` }),
        /\/pattern: "pattern" must be a regular expression of 1–256/,
      ],
      [table({ by: 'Country' }), /\/by: "by" must name a page field/],
      [table({ extra: 1 }), /\/extra: Unknown key "extra"/],
      [table({ sets: { GE: {} } }), /\/sets\/GE: Invalid set name "GE"/],
      [table({ by: undefined, sets: { ge: {} } }), /\/sets\/ge: A table without "by" has one set, "\*"/],
      [
        table({ sets: { ge: { 'a b': { image: 'sign/ge/2.3.svg' } } } }),
        /\/sets\/ge\/a b: The value "a b" does not match "pattern"/,
      ],
      [
        table({ sets: { ge: { 2: { image: '../x.svg' } } } }),
        /\/sets\/ge\/2\/image: "image" must be a path inside references\//,
      ],
      [
        table({ sets: { ge: { 2: { image: 'sign/ge/2.3.svg', width: 0 } } } }),
        /\/sets\/ge\/2\/width: "width" must be a whole number/,
      ],
      [
        table({ sets: { ge: { 2: { image: 'sign/ge/2.3.svg', name: { ru: 'x'.repeat(201) } } } } }),
        /\/sets\/ge\/2\/name: "name" must be an object of texts by language/,
      ],
      [
        table({ sets: { ge: { 2: { image: 'sign/ge/2.3.svg', href: '/x' } } } }),
        /\/sets\/ge\/2\/href: Unknown key "href" for a "image" table/,
      ],
      ['{', /Not valid JSON/],
    ];
    const isSignTableIssue = (issue) => issue.startsWith('REFERENCES_TABLE_INVALID references/sign.json');
    for (const [text, expected] of cases) {
      const { code, issues } = await issuesOf({ ...BASE_FILES, 'references/sign.json': text });
      assert.ok(
        issues.some((issue) => isSignTableIssue(issue) && expected.test(issue)),
        `${text}: ${issues.join('\n')}`,
      );
      assert.equal(code.references.has('sign'), false, 'an invalid table is not used');
    }
    const badHref = { ...LAW, sets: { ge: { article_1: { href: 'javascript:alert(1)' } } } };
    const term = await issuesOf({ 'references/law.json': JSON.stringify(badHref) });
    assert.match(term.issues.join('\n'), /\/sets\/ge\/article_1\/href: "href" must be a root path/);
  });

  test('a missing image is REFERENCES_IMAGE_MISSING; an https: image needs no file', async () => {
    const { issues } = await issuesOf({
      ...BASE_FILES,
      'references/sign/ge/2.3.svg': undefined,
      'references/sign.json': table({
        sets: { ge: { 2: { image: 'sign/ge/none.svg' }, 3: { image: 'https://media.example/3.png' } } },
      }),
    });
    assert.deepEqual(
      issues.filter((i) => i.includes('sign.json')),
      [
        'REFERENCES_IMAGE_MISSING references/sign.json/sets/ge/2/image: ' +
          'references/sign/ge/none.svg is not a file of the site code.',
      ],
    );
  });

  test('limits: kinds, file size, entries per set; kind names; a link scheme is no kind', async () => {
    const kindFiles = Array.from({ length: REFERENCE_LIMITS.kinds + 1 }, (_, i) => `references/k${i}.json`);
    const many = Object.fromEntries(kindFiles.map((file) => [file, JSON.stringify(LAW)]));
    assert.match((await issuesOf(many)).issues.join('\n'), /declares 11 reference kinds; at most 10/);
    const small = JSON.stringify({ ...LAW, sets: { ge: { article_1: { label: { ru: 'x' } } } } });
    const big = small.replace('}}}}', `}}}, "x": "${'y'.repeat(REFERENCE_LIMITS.fileBytes)}"}`);
    assert.match(
      (await issuesOf({ 'references/law.json': big })).issues.join('\n'),
      /bytes; a reference table may have at most 1048576/,
    );
    const values = Array.from({ length: REFERENCE_LIMITS.entriesPerSet + 1 }, (_, i) => `article_${i}`);
    const entries = Object.fromEntries(values.map((value) => [value, { label: { ru: 'x' } }]));
    const crowded = JSON.stringify({ ...LAW, sets: { ge: entries } });
    assert.match(
      (await issuesOf({ 'references/law.json': crowded })).issues.join('\n'),
      /The set has 5001 entries; at most 5000/,
    );
    assert.match(
      (await issuesOf({ 'references/Sign.json': JSON.stringify(LAW) })).issues.join('\n'),
      /Invalid reference kind "Sign"/,
    );
    assert.match(
      (await issuesOf({ 'references/https.json': JSON.stringify(LAW) })).issues.join('\n'),
      /"https" is a link scheme/,
    );
  });
});

describe('site code: capture and release', () => {
  test('references/ is a code root', () => {
    assert.equal(isCodeInput('references/sign.json'), true);
    assert.equal(isCodeInput('references/sign/ge/2.3.svg'), true);
    assert.equal(isCodeInput('references/README.md'), false);
  });

  /** The captured files of a minimal release with one block, plus `files` (undefined leaves a file out). */
  const inputs = (files) =>
    new Map(
      present({
        'scripts/components.js': '// loader\n',
        'styles/styles.css': '/* s */\n',
        'components/note/note.json': JSON.stringify(NOTE),
        ...files,
      }).map(([file, text]) => [file, Buffer.from(text)]),
    );
  const errorsOf = (result) => result.diagnostics.filter((d) => d.severity === 'error');

  test('an invalid table refuses the code release; a valid one is released', async () => {
    const refused = await checkCodeRelease(inputs({ ...BASE_FILES, 'references/sign/ge/2.3.svg': undefined }));
    assert.match(
      errorsOf(refused).map(issueLine).join('\n'),
      /REFERENCES_IMAGE_MISSING references\/sign\.json\/sets\/ge\/2\.3\/image/,
    );
    const released = await checkCodeRelease(inputs(BASE_FILES));
    assert.deepEqual(errorsOf(released), []);
    assert.ok(released.captured.includes('references/sign.json'));
    assert.ok(released.captured.includes('references/sign/ge/2.3.svg'));
    assert.deepEqual([...released.siteCode.references.keys()], ['law', 'sign']);
  });
});
