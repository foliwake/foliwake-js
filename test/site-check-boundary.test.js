// The import boundary of @foliwake/site-check: no module reaches the engine's runtime packages, the network or
// child processes, and only the modules that read a working folder touch the file system.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'packages/site-check/src');

const FORBIDDEN = [
  '@foliwake/server',
  '@foliwake/client',
  '@foliwake/react',
  '@foliwake/next',
  'node:child_process',
  'node:http',
  'node:https',
  'node:net',
];
const FILE_SYSTEM = ['node:fs', 'node:fs/promises'];
/** The modules that read a working folder (cli.ts may not exist yet). */
const FILE_SYSTEM_READERS = ['cli.ts', 'read-folder.ts', 'site-code.ts', 'descriptor-check.ts'];

/** Every .ts module under src/, as a posix path relative to it. */
function modules() {
  const entries = readdirSync(SRC, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'));
  return files.map((entry) => path.relative(SRC, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

const SPECIFIERS = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** The module specifiers a source text imports (static, side-effect, dynamic and require). */
function importsOf(text) {
  return SPECIFIERS.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1]));
}

const sourceOf = (file) => readFileSync(path.join(SRC, file), 'utf8');

/** A specifier that names `name` itself or a subpath of it. */
const names = (specifier, name) => specifier === name || specifier.startsWith(`${name}/`);

test('the source has modules to check', () => {
  const found = modules();
  assert.ok(found.length > 10, found.join(', '));
  const expected = ['check.ts', 'site-code.ts', 'read-folder.ts', 'blocks/pack.ts'];
  for (const file of expected) assert.ok(found.includes(file), file);
});

test('no module imports the engine runtime packages, the network or child processes', () => {
  for (const file of modules()) {
    const forbidden = importsOf(sourceOf(file)).filter((spec) => FORBIDDEN.some((name) => names(spec, name)));
    assert.deepEqual(forbidden, [], file);
  }
});

test('no module calls fetch()', () => {
  for (const file of modules()) assert.doesNotMatch(sourceOf(file), /\bfetch\s*\(/, file);
});

test('only the modules that read a working folder import node:fs', () => {
  const readers = [];
  for (const file of modules()) {
    const usesFs = importsOf(sourceOf(file)).some((spec) => FILE_SYSTEM.includes(spec));
    if (usesFs) readers.push(file);
  }
  const outside = readers.filter((file) => !FILE_SYSTEM_READERS.includes(file));
  assert.deepEqual(outside, [], `allowed: ${FILE_SYSTEM_READERS.join(', ')}`);
  assert.ok(readers.includes('read-folder.ts'), 'the folder reader is found by the scan');
});

test('the scan sees every import form', () => {
  const text = [
    "import { a } from 'node:http';",
    "import {\n  b,\n} from '@foliwake/server/x';",
    "import 'node:net';",
    "const c = await import('node:child_process');",
    "export * from 'node:https';",
  ].join('\n');
  assert.deepEqual(importsOf(text).sort(), [
    '@foliwake/server/x',
    'node:child_process',
    'node:http',
    'node:https',
    'node:net',
  ]);
});
