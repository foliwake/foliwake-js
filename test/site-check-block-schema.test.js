// The JSON Schema of block definitions is the validator's tables (blocks/pack) and cannot drift from them;
// `$schema` in a definition is ignored by the site code reader. Ported from the engine's tests (behaviour parity).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  ANSWER_ID_RULES,
  ARGUMENT_KEYS,
  BLOCK_KEYS,
  CORRECT_RULES,
  FIELD_KEYS,
} from '@foliwake/site-check/blocks/pack';
import { BLOCK_SCHEMA_FILE, blockDefinitionSchema, blockSchemaText } from '@foliwake/site-check/blocks/schema';
import { readSiteCode } from '@foliwake/site-check/site-code';

/** The field variants of a schema, by their `type` constant. */
const variantsOf = (schema) => schema.properties.fields.items.oneOf;
const variantOf = (schema, type) => variantsOf(schema).find((v) => v.properties.type.const === type);

test('JSON Schema = pack tables: the file has exactly the keys of BLOCK_KEYS, FIELD_KEYS, ARGUMENT_KEYS', () => {
  const text = blockSchemaText();
  assert.ok(text.endsWith('}\n'), 'one trailing newline');
  const schema = JSON.parse(text);
  assert.deepEqual(schema, blockDefinitionSchema(), 'the file is the schema');
  assert.equal(BLOCK_SCHEMA_FILE, 'block-1.schema.json');
  assert.deepEqual(Object.keys(schema.properties), ['$schema', ...BLOCK_KEYS]);
  assert.deepEqual(Object.keys(schema.properties.argument.properties), ARGUMENT_KEYS);
  const keysOf = (variant) => [variant.properties.type.const, Object.keys(variant.properties)];
  const fieldKeys = Object.fromEntries(variantsOf(schema).map(keysOf));
  assert.deepEqual(fieldKeys, FIELD_KEYS);
});

test('the schema has exactly the keys the engine accepts, closed, with its enums', () => {
  const schema = blockDefinitionSchema();
  assert.deepEqual(Object.keys(schema.properties), ['$schema', ...BLOCK_KEYS]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties.argument.properties), ARGUMENT_KEYS);
  const variants = variantsOf(schema);
  assert.deepEqual(variants.map((v) => v.properties.type.const), Object.keys(FIELD_KEYS));
  for (const variant of variants) {
    const type = variant.properties.type.const;
    assert.deepEqual(Object.keys(variant.properties), FIELD_KEYS[type], type);
    assert.equal(variant.additionalProperties, false, type);
  }
  const choices = variantOf(schema, 'choices');
  assert.deepEqual(choices.properties.ids.enum, ANSWER_ID_RULES);
  assert.deepEqual(choices.properties.correct.additionalProperties.enum, CORRECT_RULES);
  assert.deepEqual(variantOf(schema, 'heading').properties.level.enum, [2, 3, 4]);
});

/** The site code of a folder with one block `note` defined by `definition`. */
async function siteWith(definition) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fw-block-schema-'));
  await mkdir(path.join(dir, 'components', 'note'), { recursive: true });
  await writeFile(path.join(dir, 'components', 'note', 'note.json'), JSON.stringify(definition));
  try {
    return await readSiteCode(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('`$schema` (a string) is ignored: same pack digest, signature and blocks.json definitions', async () => {
  const plain = { fields: [{ name: 'text', type: 'text', max: null }] };
  const without = await siteWith(plain);
  const withRef = await siteWith({ $schema: '../../.foliwake/schemas/block-1.schema.json', ...plain });
  assert.deepEqual(withRef.diagnostics, []);
  assert.equal(withRef.pack.digest, without.pack.digest);
  assert.equal(withRef.pack.blocks.get('note').signature, without.pack.blocks.get('note').signature);
  assert.deepEqual(withRef.definitions, without.definitions);
});

test('a `$schema` that is not a string stays an unknown key', async () => {
  const site = await siteWith({ $schema: 7, fields: [{ name: 'text', type: 'text' }] });
  const found = site.diagnostics.map((d) => [d.code, d.file, d.field]);
  assert.deepEqual(found, [['BLOCKS_PACK_INVALID', 'components/note/note.json', '/$schema']]);
  assert.equal(site.diagnostics[0].component, 'note');
  assert.deepEqual([site.diagnostics[0].line, site.diagnostics[0].column], [1, 2], 'the position of the key');
});
