// The component descriptor: an old frontend descriptor (hero, accordion, lesson, no `question`) stays valid for the
// check and for a code release; a frontend that declares `question` passes. Ported from the engine's tests.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { checkCodeRelease } from '@foliwake/site-check';
import { CATALOGUE_COMPONENTS, checkDescriptor } from '@foliwake/site-check/descriptor-check';
import { validateDescriptor } from '@foliwake/site-check/formats/descriptor';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/site-check/frontend');

const ASSETLESS = { css: false, js: false };
const OLD = { htmlContract: 1, components: { hero: ASSETLESS, accordion: ASSETLESS, lesson: ASSETLESS } };
const WITH_QUESTION = { ...OLD, components: { ...OLD.components, question: ASSETLESS } };

const descriptorDiagnostics = (descriptor) =>
  validateDescriptor({
    readText: async () => JSON.stringify(descriptor),
    hasFile: async () => false,
    htmlContract: 1,
    schemaNames: CATALOGUE_COMPONENTS,
  });

const encode = (text) => new TextEncoder().encode(text);

/** A code release with the loader, the stylesheet and `descriptor` as components/components.json. */
function releaseWith(descriptor) {
  return new Map([
    ['scripts/components.js', encode('export {};\n')],
    ['styles/styles.css', encode('body{}\n')],
    ['components/components.json', encode(JSON.stringify(descriptor))],
  ]);
}

const errorsOf = ({ diagnostics }) => diagnostics.filter((d) => d.severity === 'error');

test('the catalogue that every frontend must declare is unchanged (question is not in it)', () => {
  assert.deepEqual([...CATALOGUE_COMPONENTS].sort(), ['accordion', 'hero', 'lesson']);
});

test('an old frontend descriptor (no question) is still valid for check and code prepare', async () => {
  assert.deepEqual(await descriptorDiagnostics(OLD), []);
  assert.deepEqual(await descriptorDiagnostics(WITH_QUESTION), []);
  const checked = await checkCodeRelease(releaseWith(OLD), { htmlContract: 1 });
  assert.deepEqual(errorsOf(checked), []);
});

test('a code release of another HTML contract than its descriptor is refused (CODE_DESCRIPTOR_INVALID)', async () => {
  const checked = await checkCodeRelease(releaseWith(OLD), { htmlContract: 2 });
  const found = errorsOf(checked).map((d) => [d.code, d.file, d.message]);
  const message = 'htmlContract is 1, but the generator produces version 2.';
  assert.deepEqual(found, [['CODE_DESCRIPTOR_INVALID', 'components/components.json', message]]);
});

test('a hand-written descriptor must declare the catalogue; a missing name is CODE_SCHEMA_NOT_DECLARED', async () => {
  const { lesson: _lesson, ...withoutLesson } = OLD.components;
  const checked = await checkCodeRelease(releaseWith({ ...OLD, components: withoutLesson }), { htmlContract: 1 });
  const found = errorsOf(checked).map((d) => [d.code, d.component]);
  assert.deepEqual(found, [['CODE_SCHEMA_NOT_DECLARED', 'lesson']]);
});

test('a frontend that declares question with its assets passes the descriptor check', async () => {
  const text = await readFile(path.join(FRONTEND, 'components', 'components.json'), 'utf8');
  const descriptor = JSON.parse(text);
  assert.deepEqual(descriptor.components.question, { css: true, js: true });
  const diagnostics = await validateDescriptor({
    readText: async () => text,
    hasFile: async (relative) => readFile(path.join(FRONTEND, relative)).then(() => true, () => false),
    htmlContract: 2,
    schemaNames: CATALOGUE_COMPONENTS,
  });
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(await checkDescriptor({ cwd: FRONTEND, htmlContract: 2 }), []);
});

test('checkDescriptor of a folder: a declared asset that is missing is CODE_ASSET_MISSING', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fw-descriptor-'));
  try {
    await mkdir(path.join(dir, 'components'), { recursive: true });
    const declared = { ...OLD, components: { ...OLD.components, question: { css: true, js: false } } };
    await writeFile(path.join(dir, 'components', 'components.json'), JSON.stringify(declared));
    const diagnostics = await checkDescriptor({ cwd: dir, htmlContract: 1 });
    const found = diagnostics.map((d) => [d.code, d.file, d.component]);
    assert.deepEqual(found, [['CODE_ASSET_MISSING', 'components/question/question.css', 'question']]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
