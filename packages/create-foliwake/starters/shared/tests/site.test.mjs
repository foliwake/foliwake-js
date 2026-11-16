// Quick checks of what @foliwake/site-check does not check (run: node --test "tests/*.test.mjs"). Everything
// about the site code itself is checked by `npx @foliwake/site-check`, which the "Frontend checks" workflow runs;
// the platform runs the same checks.
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'scripts', 'vendor');

// Third-party code committed in scripts/vendor/ (e.g. React of `create-foliwake --react`) keeps its license
// next to it: scripts/vendor/<name>.js and scripts/vendor/<name>.LICENSE.txt.
test('every vendored script has its license next to it', () => {
  const scripts = existsSync(VENDOR) ? readdirSync(VENDOR).filter((name) => name.endsWith('.js')) : [];
  for (const script of scripts) {
    const license = script.replace(/\.js$/, '.LICENSE.txt');
    assert.ok(existsSync(path.join(VENDOR, license)), `scripts/vendor/${script}: add its license as ${license}`);
  }
});
