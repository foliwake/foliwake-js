// @foliwake/core-contract: the copy of the engine's contract is unchanged since its sync, the package's sources
// are what that copy gives, and the built package answers from it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { CONTRACT_DIGEST, CORE_API, ERROR_CODES, PROCEDURES, procedureType } from '@foliwake/core-contract';

import { ENGINE_DIR, PACKAGE_DIR, checksumsOf, generatedSources } from '../tools/core-contract-sync.mjs';

const read = (file) => readFileSync(file, 'utf8');

test('engine/ holds the files recorded in engine/checksums.json (synced, never edited by hand)', () => {
  const recorded = JSON.parse(read(path.join(ENGINE_DIR, 'checksums.json')));
  assert.deepEqual(checksumsOf(), recorded);
});

test('src/ is what engine/ gives (pnpm core-contract:sync writes both)', () => {
  for (const [file, text] of Object.entries(generatedSources())) {
    assert.equal(read(path.join(PACKAGE_DIR, file)), text, `packages/core-contract/${file} is stale`);
  }
});

test('the built package answers the engine manifest', () => {
  const manifest = JSON.parse(read(path.join(ENGINE_DIR, 'manifest.json')));
  assert.equal(CORE_API, manifest.api);
  assert.equal(CONTRACT_DIGEST, manifest.digest);
  assert.deepEqual({ ...PROCEDURES }, manifest.procedures);
  assert.equal(procedureType('sites.status'), 'query');
  assert.equal(procedureType('code.deploy'), 'mutation');
  assert.equal(procedureType('toString'), undefined);
  assert.equal(ERROR_CODES.PROCEDURE_UNKNOWN, 'not_found');
});

test('the declarations type a caller: every procedure of the manifest is in CoreProcedures', () => {
  const declarations = read(path.join(PACKAGE_DIR, 'dist/procedures.d.ts'));
  for (const name of Object.keys(PROCEDURES)) assert.ok(declarations.includes(`  ${JSON.stringify(name)}: {`), name);
  assert.match(read(path.join(PACKAGE_DIR, 'dist/index.d.ts')), /export type \* from '\.\/procedures\.js'/);
});
