// The examples in the hand-written part of the app package READMEs, and in the guides of the documentation site
// (docs/blocks, docs/embed), compile against the packages as built: every ```ts and ```tsx block is written to
// its own module and typechecked (strict) with the TypeScript compiler API, resolving @foliwake/* through the
// workspace like an app would.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { PACKAGES } from '../tools/packages-reference.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The ```ts / ```tsx blocks of a README's hand-written part (before the generated API). */
export function exampleBlocks(text) {
  const usage = text.slice(0, text.indexOf('<!-- usagestop -->'));
  return [...usage.matchAll(/^```(tsx?)\n([\s\S]*?)^```$/gm)].map((m) => ({ lang: m[1], code: m[2] }));
}

/** The ```ts / ```tsx blocks of a guide page (the whole page). */
export function guideBlocks(text) {
  return [...text.matchAll(/^```(tsx?)\n([\s\S]*?)^```$/gm)].map((m) => ({ lang: m[1], code: m[2] }));
}

/** The guide pages of the documentation site whose code is checked. */
const GUIDE_DIRS = ['docs/blocks', 'docs/embed'];

function guidePages() {
  return GUIDE_DIRS.flatMap((dir) => readdirSync(path.join(ROOT, dir))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(dir, name)));
}

/** Writes each block to its own module under `dir` and returns the type errors of all of them. */
function typecheck(dir, blocks) {
  const files = blocks.map(({ id, lang, code }) => {
    const file = path.join(dir, `${id}.${lang}`);
    writeFileSync(file, code);
    return file;
  });
  // `next` is a dependency of @foliwake/next, not of the repository root: resolve it from there.
  const next = realpathSync(path.join(ROOT, 'packages/next/node_modules/next'));
  const program = ts.createProgram(files, {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: ['node'],
    jsx: ts.JsxEmit.ReactJSX,
    paths: { next: [next], 'next/*': [`${next}/*`] },
  });
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const where = d.file ? `${path.basename(d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}` : '';
    return `${where} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
  });
}

/** Runs `fn` with a scratch folder inside the repository, so @foliwake/*, react and react-dom resolve. */
function inScratch(name, fn) {
  const dir = path.join(ROOT, 'test', `.${name}-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('README examples of the published packages typecheck', () => {
  const blocks = PACKAGES.flatMap((name) => {
    const found = exampleBlocks(readFileSync(path.join(ROOT, 'packages', name, 'README.md'), 'utf8'));
    assert.ok(found.length >= 3, `${name}: at least a minimal and two task examples`);
    return found.map((block, i) => ({ ...block, id: `${name}-${i + 1}` }));
  });
  assert.deepEqual(inScratch('readme-examples', (dir) => typecheck(dir, blocks)), []);
});

test('the code of the documentation guides typechecks', () => {
  const blocks = guidePages().flatMap((page) => {
    const id = page.replaceAll('/', '-').replace(/\.md$/, '');
    const found = guideBlocks(readFileSync(path.join(ROOT, page), 'utf8'));
    return found.map((block, i) => ({ ...block, id: `${id}-${i + 1}` }));
  });
  assert.ok(blocks.length >= 10, 'the guides have their TypeScript examples');
  assert.deepEqual(inScratch('guide-examples', (dir) => typecheck(dir, blocks)), []);
});
