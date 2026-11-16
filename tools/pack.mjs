#!/usr/bin/env node
// Packs the packages with `pnpm pack` (which rewrites `workspace:*` to the exact version) into one
// directory, in publish order: `pnpm pack:all` (default directory .tarballs/, removed first).
//
//   node tools/pack.mjs [directory]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLISH_ORDER } from './packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? path.join(ROOT, '.tarballs'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const name of PUBLISH_ORDER) {
  execFileSync('pnpm', ['pack', '--pack-destination', out], { cwd: path.join(ROOT, 'packages', name), stdio: 'inherit' });
}
