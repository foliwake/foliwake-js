// The minified kit of @foliwake/block-kit (dist/block-kit.js), made by tools/build.mjs from the readable module tsc
// compiled from src/block-kit.ts (kept next to it as dist/block-kit.debug.js). The engine copies block-kit.js into
// every code release, so it is the file pages download; the debug copy is for reading and stepping through.
//
// Terser (an exact-pinned devDependency, pure JavaScript) with options that keep the module's behaviour:
// - module: the file stays an ES module; exported names are kept, local names are mangled.
// - no property mangling: lit-html reads `_$litType$`, blocks read the ctx members by name.
// - strings are kept as written, so `import('./lit-html.js')` still resolves next to the kit.
// - ecma 2020 is Terser's highest output level; it never rewrites syntax down, so the ES2023 input stays ES2023.
// No comment of the source is kept: the file starts with HEADER (the kit, its readable copy, lit-html's notice).
import { minify } from 'terser';

/** The comment that starts the minified file. */
const HEADER = [
  '// Foliwake block-kit (https://docs.foliwake.dev/guide/write-a-block): the module `@foliwake/block-kit`.',
  '// Minified; the readable module is block-kit.debug.js in the package @foliwake/block-kit (dist/).',
  "// `html` is lit-html's (lit-html.js, lit-html 3.3.3):",
  '//   Copyright (c) 2017 Google LLC. All rights reserved.',
  '//   SPDX-License-Identifier: BSD-3-Clause (the full text: lit-html.LICENSE in the package)',
].join('\n');

const OPTIONS = Object.freeze({
  module: true,
  ecma: 2020,
  compress: { passes: 2 },
  mangle: true,
  format: { comments: false, preamble: HEADER },
});

/** The minified kit for `readable`, the source text of the compiled module. */
export async function minifyKit(readable) {
  const result = await minify(readable, OPTIONS);
  return `${result.code}\n`;
}
