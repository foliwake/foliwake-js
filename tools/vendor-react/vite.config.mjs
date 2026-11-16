// Vite (Rolldown) build of the vendored React for site blocks (entry.js): one
// minified ES module with the entry's exports. Run by tools/build.mjs:
// `vite build --config <this> --outDir <dir>`; the LICENSE is copied next to it there.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const versionOf = (name) => JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')).version;
// The whole MIT license of React (react-dom has the same text) stays in the file as a legal comment, so it
// travels with the script into code releases, which carry no .txt files.
const license = readFileSync(path.join(path.dirname(require.resolve('react/package.json')), 'LICENSE'), 'utf8').trim();
if (license.includes('*/')) throw new Error('react/LICENSE cannot be put into a comment');
const banner = `/*! React ${versionOf('react')} and ReactDOM ${versionOf('react-dom')} (react-dom/client), production build for Foliwake site blocks.
${license.split('\n').map((line) => ` * ${line}`.trimEnd()).join('\n')}
 */`;

export default defineConfig({
  root: here,
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    copyPublicDir: false,
    reportCompressedSize: false,
    modulePreload: false,
    rollupOptions: {
      input: path.join(here, 'entry.js'),
      preserveEntrySignatures: 'strict',
      output: { format: 'es', entryFileNames: 'react.js', postBanner: banner },
    },
  },
});
