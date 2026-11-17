// The documentation site's package pages (docs/scripts/reference.mjs) are copies of the package READMEs: every
// published package has one, and a README whose first line is not "# <npm name>" fails here, not in the
// Pages build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { referencePage } from '../docs/scripts/reference.mjs';
import { PACKAGES } from '../tools/packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('docs: one reference page per published package, copied from its README', () => {
  for (const { dir, name } of PACKAGES) {
    const readme = readFileSync(path.join(ROOT, 'packages', dir, 'README.md'), 'utf8');
    const page = referencePage(dir, name, readme);
    assert.ok(page.startsWith(`---\ntitle: ${JSON.stringify(name)}\n`), `${dir}: front matter`);
    assert.ok(page.includes(`packages/${dir}/README.md`), `${dir}: names its source`);
    assert.ok(page.endsWith(readme.slice(readme.indexOf('\n') + 1)), `${dir}: the README, unchanged`);
  }
});

test('docs: a README with another first heading is refused', () => {
  assert.throws(() => referencePage('client', '@foliwake/client', '# client\n'), /must be "# @foliwake\/client"/);
});
