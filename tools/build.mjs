#!/usr/bin/env node
// Builds the packages with tsc, in dependency order (each compiles against the declarations of those
// before it): `pnpm build`. Each package is compiled into dist.next/ and swapped in only when tsc succeeds,
// so a failed build leaves the previous dist/ in place and never a partial one.
//
// @foliwake/block-kit's kit is compiled by tsc like the other sources: src/block-kit.ts becomes one readable browser
// module whose only import is the dynamic one of the vendored ./lit-html.js, kept as dist/block-kit.debug.js. Its
// minified copy (tools/minify-kit.mjs) is dist/block-kit.js, the file the engine copies as it is into every code
// release. Its standalone declaration, dist/foliwake.d.ts, is composed from the generated one
// (tools/block-kit-declaration.mjs).
//
// create-foliwake also gets the vendored React of its starters (vendor/react.js and its license), built with Vite
// from this repository's exact-pinned react and react-dom (tools/vendor-react/), staged and swapped the same way.
//
//   node tools/build.mjs              build every package
//   node tools/build.mjs --typecheck  build, then typecheck every package's sources (tsc --noEmit)
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { standaloneDeclaration } from './block-kit-declaration.mjs';
import { minifyKit } from './minify-kit.mjs';
import { PUBLISH_ORDER } from './packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The packages in build (and publish) order: each after the packages it depends on. */
export const BUILD_ORDER = PUBLISH_ORDER;

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

function run(args) {
  const result = spawnSync(process.execPath, [tsc, ...args], { cwd: ROOT, stdio: 'inherit' });
  return result.status ?? 1;
}

/**
 * Files a package ships as written (browser modules and declarations that are not compiled): copied from src/ to
 * dist/ after tsc checked the package. lit-html.js (lit-html 3.3.3) stays vendored JS as written: it is never
 * recompiled.
 */
const COPIED = {
  'core-contract': ['procedures.d.ts'],
  'block-kit': [
    'lit-html.js',
    'lit-html.d.ts',
    'lit-html.LICENSE',
    'assessment.d.ts',
    'assessment.js',
  ],
};

/** block-kit.js as tsc wrote it becomes block-kit.debug.js; block-kit.js is its minified copy. */
async function minifyBlockKit(staging) {
  const readable = path.join(staging, 'block-kit.debug.js');
  renameSync(path.join(staging, 'block-kit.js'), readable);
  writeFileSync(path.join(staging, 'block-kit.js'), await minifyKit(readFileSync(readable, 'utf8')));
}

/** Files a package's build composes from tsc's output in dist/, after the copies. */
const COMPOSED = {
  'block-kit': async (staging) => {
    const kit = readFileSync(path.join(staging, 'block-kit.d.ts'), 'utf8');
    const lit = readFileSync(path.join(staging, 'lit-html.d.ts'), 'utf8');
    writeFileSync(path.join(staging, 'foliwake.d.ts'), standaloneDeclaration(kit, lit));
    await minifyBlockKit(staging);
  },
};

function copySources(name, staging) {
  mkdirSync(staging, { recursive: true });
  for (const file of COPIED[name] ?? [])
    copyFileSync(path.join(ROOT, 'packages', name, 'src', file), path.join(staging, file));
}

async function build(name) {
  const dir = path.join(ROOT, 'packages', name);
  const staging = path.join(dir, 'dist.next');
  const live = path.join(dir, 'dist');
  rmSync(staging, { recursive: true, force: true });
  const status = run(['-p', path.join(dir, 'tsconfig.json'), '--outDir', staging]);
  if (status !== 0) {
    rmSync(staging, { recursive: true, force: true });
    console.error(`build: packages/${name} failed; its previous dist/ is unchanged.`);
    return status;
  }
  copySources(name, staging);
  await COMPOSED[name]?.(staging);
  if (existsSync(live)) rmSync(live, { recursive: true, force: true });
  renameSync(staging, live);
  return 0;
}

const VENDOR_PACKAGE = 'create-foliwake';

function buildVendorReact() {
  const require = createRequire(import.meta.url);
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  const config = path.join(ROOT, 'tools/vendor-react/vite.config.mjs');
  const staging = path.join(ROOT, 'packages', VENDOR_PACKAGE, 'vendor.next');
  const live = path.join(ROOT, 'packages', VENDOR_PACKAGE, 'vendor');
  rmSync(staging, { recursive: true, force: true });
  const args = [vite, 'build', '--config', config, '--outDir', staging, '--emptyOutDir', '--logLevel', 'warn'];
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    rmSync(staging, { recursive: true, force: true });
    console.error('build: the vendored React failed; the previous vendor/ is unchanged.');
    return result.status ?? 1;
  }
  const license = path.join(path.dirname(require.resolve('react/package.json')), 'LICENSE');
  copyFileSync(license, path.join(staging, 'react.LICENSE.txt'));
  if (existsSync(live)) rmSync(live, { recursive: true, force: true });
  renameSync(staging, live);
  return 0;
}

const typecheck = process.argv.includes('--typecheck');
for (const name of BUILD_ORDER) {
  const status = await build(name);
  if (status !== 0) process.exit(status);
}
if (BUILD_ORDER.includes(VENDOR_PACKAGE)) {
  const status = buildVendorReact();
  if (status !== 0) process.exit(status);
}
if (typecheck) {
  for (const name of BUILD_ORDER) {
    const status = run(['-p', path.join(ROOT, 'packages', name, 'tsconfig.json'), '--noEmit']);
    if (status !== 0) process.exit(status);
  }
}
