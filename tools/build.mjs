#!/usr/bin/env node
// Builds the packages with tsc, in dependency order (each compiles against the declarations of those
// before it): `pnpm build`. Each package is compiled into dist.next/ and swapped in only when tsc succeeds,
// so a failed build leaves the previous dist/ in place and never a partial one.
//
//   node tools/build.mjs              build every package
//   node tools/build.mjs --typecheck  build, then typecheck every package's sources (tsc --noEmit)
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLISH_ORDER } from './packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The packages in build (and publish) order: each after the packages it depends on. */
export const BUILD_ORDER = PUBLISH_ORDER;

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

function run(args) {
  const result = spawnSync(process.execPath, [tsc, ...args], { cwd: ROOT, stdio: 'inherit' });
  return result.status ?? 1;
}

function build(name) {
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
  if (existsSync(live)) rmSync(live, { recursive: true, force: true });
  renameSync(staging, live);
  return 0;
}

const typecheck = process.argv.includes('--typecheck');
for (const name of BUILD_ORDER) {
  const status = build(name);
  if (status !== 0) process.exit(status);
}
if (typecheck) {
  for (const name of BUILD_ORDER) {
    const status = run(['-p', path.join(ROOT, 'packages', name, 'tsconfig.json'), '--noEmit']);
    if (status !== 0) process.exit(status);
  }
}
