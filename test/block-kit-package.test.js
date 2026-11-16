// @foliwake/block-kit as a package: a block author's module compiles against its declarations alone (the kit's
// types and the blocks contract's, from one import), the kit's types agree with the contract, the standalone
// declaration needs no other package, and dist/ holds the browser files as written (no source map comment).
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = path.join(ROOT, 'packages/block-kit');
const read = (file) => readFileSync(path.join(PACKAGE, file), 'utf8');

const AUTHOR = `
import { defineBlock, html, readFields, type BlockHost, type BlockInit, type ContractBlockInit } from '@foliwake/block-kit';
import type { AssessmentHost, SavedAnswer } from '@foliwake/block-kit';
import type { AssessmentEvents } from '@foliwake/block-kit/assessment';
import type { BlockMeta as ContractMeta } from '@foliwake/blocks-contract';
import type { BlockMeta, HostMembers } from '@foliwake/block-kit';

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

test('dist/ holds the browser files as written; lit-html without its source map comment', () => {
  for (const file of ['block-kit.js', 'block-kit-1.js', 'lit-html.js', 'lit-html.LICENSE', 'foliwake.d.ts']) {
    assert.equal(read(`dist/${file}`), read(`src/${file}`), file);
  }
  assert.doesNotMatch(read('dist/lit-html.js'), /sourceMappingURL/);
  assert.match(read('dist/block-kit.js'), /^import \{ html, nothing, render as renderTemplate \} from '\.\/lit-html\.js';$/m);
  assert.match(read('dist/block-kit.js'), /^export function readFields\(root\) \{$/m);
});
