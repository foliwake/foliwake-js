// @foliwake/next ships the config schemas too, so `$schema` resolves when only @foliwake/next is a direct
// dependency (pnpm does not hoist @foliwake/server). The copies must equal the ones of @foliwake/server.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'packages/server/schemas');
const NEXT = path.join(ROOT, 'packages/next/schemas');

test('@foliwake/next ships every schema of @foliwake/server, byte for byte', async () => {
  const names = (await readdir(SERVER)).sort();
  assert.deepEqual((await readdir(NEXT)).sort(), names);
  for (const name of names) {
    const server = await readFile(path.join(SERVER, name), 'utf8');
    const next = await readFile(path.join(NEXT, name), 'utf8');
    assert.equal(next, server, `packages/next/schemas/${name} differs: copy it from packages/server/schemas`);
  }
});

test('@foliwake/next exports each schema file', async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'packages/next/package.json'), 'utf8'));
  for (const name of await readdir(NEXT)) {
    assert.equal(manifest.exports[`./schemas/${name}`], `./schemas/${name}`);
  }
  assert.ok(manifest.files.includes('schemas/'));
});
