#!/usr/bin/env node
// Writes the package reference pages of the documentation site: one page per published package,
// docs/reference/packages/<dir>.md, copied from packages/<dir>/README.md.
//
// The README stays the one source. Its hand-written part is the package's usage; its API section (between the
// `<!-- api -->` markers) is generated from the type declarations by tools/packages-reference.mjs and checked
// by test/packages-reference.test.js. This script only copies: it adds a front matter (title, no edit link)
// and a note on where the page comes from. The output folder is git-ignored and rebuilt before every `dev` and `build`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PACKAGES } from '../../tools/packages.mjs';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(DOCS, '..');
const OUT = path.join(DOCS, 'reference', 'packages');
const SOURCE = 'https://github.com/foliwake/foliwake-js/blob/main/packages';

/** The README's text as a page: title from its first heading, a note under it. */
export function referencePage(dir, name, readme) {
  const [heading, ...rest] = readme.split('\n');
  if (heading !== `# ${name}`) throw new Error(`packages/${dir}/README.md: the first line must be "# ${name}"`);
  const note = `> Generated from [\`packages/${dir}/README.md\`](${SOURCE}/${dir}/README.md),`
    + ` the README published with the package on npm.`;
  const front = ['---', `title: ${JSON.stringify(name)}`, 'editLink: false', '---'];
  return [...front, '', heading, '', note, ...rest].join('\n');
}

function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const { dir, name } of PACKAGES) {
    const readme = readFileSync(path.join(REPO, 'packages', dir, 'README.md'), 'utf8');
    writeFileSync(path.join(OUT, `${dir}.md`), referencePage(dir, name, readme));
  }
  console.log(`reference: ${PACKAGES.length} package pages in ${path.relative(REPO, OUT)}/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
