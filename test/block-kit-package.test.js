// @foliwake/block-kit as a package: a block author's module compiles against its declarations alone (the kit's
// types and the blocks contract's, from one import), the kit's types agree with the contract, the standalone
// declaration needs no other package, the public names are those of 0.3.0, dist/ holds the frozen browser files as
// written (no source map comment), and the kit compiled from src/block-kit.ts is one self-contained module, the
// same bytes on every build.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { standaloneDeclaration } from '../tools/block-kit-declaration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = path.join(ROOT, 'packages/block-kit');
const read = (file) => readFileSync(path.join(PACKAGE, file), 'utf8');

const AUTHOR = `
import { defineBlock, html, readFields } from '@foliwake/block-kit';
import type { BlockHost, BlockInit, ContractBlockInit } from '@foliwake/block-kit';
import type { AssessmentHost, SavedAnswer } from '@foliwake/block-kit';
import type { AssessmentEvents } from '@foliwake/block-kit/assessment';
import type { BlockMeta as ContractMeta } from '@foliwake/blocks-contract';
import type { BlockMeta, HostMembers, KnownShell, MountHandle, ViewAdapter, ViewHandle } from '@foliwake/block-kit';

export const note: BlockInit = defineBlock('note', (fields, ctx) => {
  ctx.render(() => html\`<p>\${String(fields.text ?? '')}</p>\`);
});
declare const root: Element;
const values: Record<string, unknown> = readFields(root);
void values;

// The kit's init is a contract init, for the plain host and for an extended one.
const plain: ContractBlockInit = note;
const assessed: ContractBlockInit<AssessmentHost> = note;
void plain;
void assessed;

// The contract's host is a host of the kit.
declare const contractHost: BlockHost;
const kitHost: HostMembers = contractHost;
void kitHost;

// The kit's BlockMeta is the contract's.
declare const meta: ContractMeta;
const kitMeta: BlockMeta = meta;
const back: ContractMeta = kitMeta;
void back;

// The kit's init declares its name and the contract major; the contract's init may declare a major.
const major: 2 = note.contract;
const declared: number | undefined = (note as ContractBlockInit).contract;
void major;
void declared;
const shell: KnownShell = 'web-component';
void shell;
// ctx.mount's types are views; the contract's MountHandle is the blocks module's.
declare const adapter: ViewAdapter<{ n: number }>;
declare const view: ViewHandle<{ n: number }>;
declare const mounted: MountHandle;
void adapter;
void view.update({ n: 1 });
void mounted.ready;

declare const saved: SavedAnswer;
const correct: boolean | null = saved.correct;
void correct;
type Answer = AssessmentEvents['answer'];
const answer: Answer | null = null;
void answer;
`;

function compile(dir, files, options = {}) {
  mkdirSync(dir, { recursive: true });
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
    const program = ts.createProgram(Object.keys(files).map((name) => path.join(dir, name)), {
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
      types: [],
      ...options,
    });
    return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a block module compiles against @foliwake/block-kit alone; its types agree with the blocks contract', () => {
  const dir = path.join(ROOT, 'test', `.block-kit-types-${process.pid}`);
  assert.deepEqual(compile(dir, { 'block.ts': AUTHOR }), []);
});

test('the standalone declaration (for `.foliwake/types/foliwake.d.ts`) imports nothing', () => {
  const declaration = read('dist/foliwake.d.ts');
  assert.doesNotMatch(declaration, /^\s*import\b|\bfrom\s+['"]/m);
  const dir = path.join(ROOT, 'test', `.block-kit-types-standalone-${process.pid}`);
  const user = "import { defineBlock } from './foliwake.js';\nexport default defineBlock('a', () => {});\n";
  assert.deepEqual(compile(dir, { 'foliwake.d.ts': declaration, 'use.ts': user }), []);
});

test('dist/ holds the frozen browser files as written; lit-html without its source map comment', () => {
  for (const file of ['block-kit-1.js', 'lit-html.js', 'lit-html.LICENSE']) {
    assert.equal(read(`dist/${file}`), read(`src/${file}`), file);
  }
  assert.doesNotMatch(read('dist/lit-html.js'), /sourceMappingURL/);
  const litImport = /^import \{ html, nothing, render as renderTemplate \} from '\.\/lit-html\.js';$/m;
  assert.match(read('dist/block-kit.js'), litImport);
  assert.match(read('dist/block-kit.js'), /^export function readFields\(root\) \{$/m);
});

/** The names each declaration entry exports, sorted (read with the compiler, as a consumer sees them). */
function exportedNames(entries) {
  const files = Object.values(entries).map((file) => path.join(PACKAGE, 'dist', file));
  const program = ts.createProgram(files, {
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
    types: [],
  });
  const checker = program.getTypeChecker();
  const names = {};
  for (const [entry, file] of Object.entries(entries)) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(path.join(PACKAGE, 'dist', file)));
    names[entry] = checker.getExportsOfModule(module).map((symbol) => symbol.name).sort();
  }
  return names;
}

test('the declarations export the names of 0.3.0 (hand-written then, generated from the source now)', () => {
  const snapshot = JSON.parse(readFileSync(path.join(ROOT, 'test/fixtures/block-kit/public-names.json'), 'utf8'));
  const entries = { '.': 'index.d.ts', './assessment': 'assessment.d.ts', './foliwake.d.ts': 'foliwake.d.ts' };
  assert.deepEqual(exportedNames(entries), snapshot);
});

test('dist/block-kit.js is one module: its only import is ./lit-html.js; the header and lit-html notice stay', () => {
  const kit = read('dist/block-kit.js');
  const { importedFiles } = ts.preProcessFile(kit, true, true);
  assert.deepEqual(importedFiles.map((file) => file.fileName), ['./lit-html.js']);
  assert.match(kit, /^\/\/ Foliwake block-kit \(https:\/\/docs\.foliwake\.dev\/guide\/write-a-block\)/);
  assert.match(kit, /^\/\/ {3}Copyright \(c\) 2017 Google LLC\. All rights reserved\.$/m);
  assert.doesNotMatch(kit, /sourceMappingURL/);
});

/** The kit compiled from the source into a fresh folder: block-kit.js and the standalone declaration. */
function compileKit() {
  const out = mkdtempSync(path.join(os.tmpdir(), 'block-kit-build-'));
  try {
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    const result = spawnSync(process.execPath, [tsc, '-p', path.join(PACKAGE, 'tsconfig.json'), '--outDir', out]);
    assert.equal(result.status, 0, String(result.stdout));
    const declaration = readFileSync(path.join(out, 'block-kit.d.ts'), 'utf8');
    const litHtml = read('src/lit-html.d.ts');
    return { kit: readFileSync(path.join(out, 'block-kit.js')), foliwake: standaloneDeclaration(declaration, litHtml) };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

test('the build is deterministic: two compiles give the same bytes, those of dist/', () => {
  const first = compileKit();
  const second = compileKit();
  assert.ok(first.kit.equals(second.kit), 'block-kit.js differs between two builds');
  assert.equal(first.foliwake, second.foliwake);
  assert.ok(first.kit.equals(readFileSync(path.join(PACKAGE, 'dist/block-kit.js'))), 'dist/block-kit.js is stale');
  assert.equal(first.foliwake, read('dist/foliwake.d.ts'));
});
