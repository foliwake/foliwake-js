// Site blocks: block folders assembled into a pack with a generated descriptor, signatures that labels do not
// change, and pack validation with its ambiguity proof. Ported from the engine's tests (behaviour parity).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { ambiguityWitness, parsePack } from '@foliwake/site-check/blocks/pack';
import { readSiteCode } from '@foliwake/site-check/site-code';

const QUESTION = {
  label: { ru: 'Вопрос' },
  variants: { '': { ru: 'один ответ' }, multiple: { ru: 'несколько ответов' } },
  fields: [
    { name: 'prompt', type: 'heading', level: 2 },
    { name: 'setup', type: 'text', min: 0, max: null },
    {
      name: 'options',
      type: 'choices',
      ids: 'required',
      minItems: 2,
      correct: { '': 'exactly-one', multiple: 'at-least-one' },
    },
    { name: 'explanation', type: 'quote' },
  ],
};
const GOALS = { label: { ru: 'Цели урока' }, fields: [{ name: 'items', type: 'list', minItems: 1, maxItems: 3 }] };
const PACK = { schema: 'foliwake-blocks/1', blocks: { goals: GOALS, question: QUESTION } };

/** A temporary folder with `files` (path → text), removed after `use(dir)`. */
async function withFolder(files, use) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fw-site-code-'));
  try {
    await writeFiles(dir, files);
    return await use(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeFiles(dir, files) {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
}

test('block folders: definitions assembled per folder, descriptor generated from the files present', async () => {
  const files = {
    'components/goals/goals.json': JSON.stringify(GOALS),
    'components/goals/goals.css': '',
    'components/question/question.json': JSON.stringify(QUESTION),
    'components/question/question.css': '',
    'components/question/question.js': 'export default function init() {}',
  };
  await withFolder(files, async (dir) => {
    const code = await readSiteCode(dir);
    assert.deepEqual(code.diagnostics, []);
    assert.deepEqual([...code.pack.blocks.keys()], ['goals', 'question']);
    assert.equal(code.generated, true);
    const components = { goals: { css: true, js: false }, question: { css: true, js: true } };
    assert.deepEqual(code.descriptor, { htmlContract: 2, components });
    const brokenGoals = '{"fields": [{"name": "items", "type": "list", "colour": 1}]}';
    await writeFile(path.join(dir, 'components', 'goals', 'goals.json'), brokenGoals);
    const broken = await readSiteCode(dir);
    assert.equal(broken.pack, null);
    assert.equal(broken.diagnostics[0].file, 'components/goals/goals.json');
    assert.equal(broken.diagnostics[0].component, 'goals');
  });
});

test('a folder under components/ whose name is not a block name is reported, never read as a block', async () => {
  const files = {
    'components/note/note.json': JSON.stringify({ fields: [{ name: 'text', type: 'text' }] }),
    'components/My_Block/My_Block.json': JSON.stringify({ fields: [{ name: 'text', type: 'text' }] }),
  };
  await withFolder(files, async (dir) => {
    const code = await readSiteCode(dir);
    assert.deepEqual([...code.pack.blocks.keys()], ['note']);
    const found = code.diagnostics.map((d) => [d.code, d.file, d.component, d.field]);
    assert.deepEqual(found, [['CODE_FOLDER_NAME_INVALID', 'components/My_Block', null, null]]);
    assert.equal(code.diagnostics[0].severity, 'error');
  });
});

test('signatures: labels do not change the signature of a definition', () => {
  const pack = parsePack(JSON.stringify(PACK)).pack;
  const relabelled = { ...PACK, blocks: { ...PACK.blocks, goals: { ...GOALS, label: { ru: 'Цели' } } } };
  const signature = parsePack(JSON.stringify(relabelled)).pack.blocks.get('goals').signature;
  assert.equal(signature, pack.blocks.get('goals').signature);
  assert.notEqual(pack.blocks.get('goals').signature, pack.blocks.get('question').signature);
});

/** The issue codes of a pack of `blocks`. */
const bad = (blocks) => parsePack(JSON.stringify({ schema: 'foliwake-blocks/1', blocks })).issues.map((i) => i.code);

/** A PackField with the defaults of a parsed field. */
function field(name, type, extra = {}) {
  const defaults = { level: null, min: 1, max: 1, minItems: 1, maxItems: null, ids: 'optional', correct: {} };
  return { name, type, ...defaults, ...extra };
}

test('pack validation: unknown keys, bad types, and ambiguous field sequences are rejected', () => {
  const colour = { name: 'items', type: 'list', colour: 'red' };
  assert.deepEqual(bad({ goals: { fields: [colour] } }), ['BLOCKS_PACK_INVALID']);
  assert.deepEqual(bad({ goals: { fields: [{ name: 'items', type: 'table' }] } }), ['BLOCKS_PACK_INVALID']);
  const optional = (name, type) => ({ name, type, min: 0 });
  const ambiguous = [optional('a', 'text'), optional('b', 'image'), optional('c', 'text')];
  assert.deepEqual(bad({ x: { fields: ambiguous } }), ['BLOCKS_PACK_AMBIGUOUS']);
  // Unique although adjacent fields share a class.
  assert.equal(ambiguityWitness([field('intro', 'text', { min: 0 }), field('body', 'text')]), null);
  const witness = ambiguityWitness([
    field('a', 'text', { min: 0 }),
    field('b', 'image', { min: 0 }),
    field('c', 'text', { min: 0 }),
  ]);
  assert.deepEqual(witness, ['paragraph']);
  assert.ok(ambiguityWitness([field('a', 'text', { max: null }), field('b', 'text', { max: null })]));
});
