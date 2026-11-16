// The examples in the hand-written part of the five package READMEs compile against the packages as built:
// every ```ts and ```tsx block is written to its own module and typechecked (strict) with the TypeScript
// compiler API, resolving @foliwake/* through the workspace like an app would.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

test('README examples of the published packages typecheck', () => {
  // Inside the repository, so @foliwake/*, react and react-dom resolve from the root's node_modules.
  const dir = path.join(ROOT, 'test', `.readme-examples-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  try {
    const files = [];
    for (const name of PACKAGES) {
      const blocks = exampleBlocks(readFileSync(path.join(ROOT, 'packages', name, 'README.md'), 'utf8'));
      assert.ok(blocks.length >= 3, `${name}: at least a minimal and two task examples`);
      blocks.forEach((block, i) => {
        const file = path.join(dir, `${name}-${i + 1}.${block.lang}`);
        writeFileSync(file, block.code);
        files.push(file);
      });
    }
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
    const problems = ts.getPreEmitDiagnostics(program).map((d) => {
      const where = d.file ? `${path.basename(d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}` : '';
      return `${where} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
    });
    assert.deepEqual(problems, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
