// The API sections of the five package READMEs are generated from the
// packages' type declarations; a change of a public export must regenerate them (`pnpm packages:reference`).
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { PACKAGES, renderReferences, targets } from '../tools/packages-reference.mjs';

test('package API references are up to date (regenerate with `pnpm packages:reference`)', () => {
  const rendered = renderReferences();
  for (const name of PACKAGES) {
    for (const file of targets(name)) {
      const [current, expected] = rendered.get(file);
      assert.equal(current, expected, `${path.basename(path.dirname(file))}/${path.basename(file)} is stale`);
    }
  }
});

test('the references document the main export of every package', () => {
  const rendered = renderReferences();
  const has = (name, heading) => {
    for (const file of targets(name)) assert.ok(rendered.get(file)[1].includes(heading), `${name}: ${heading}`);
  };
  has('client', '#### `mountFoliwakePage()`');
  has('react', '#### `FoliwakePage()`');
  has('next', '### `@foliwake/next/config`');
  has('next', '#### `withFoliwake()`');
  has('blocks-contract', '#### `BlocksModule`');
  has('server', '#### `preparePage()`');
});
