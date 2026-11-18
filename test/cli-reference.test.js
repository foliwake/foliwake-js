// The command reference in packages/cli/README.md is what the commands say (regenerate: `pnpm cli:reference`).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderReadme } from '../tools/cli-reference.mjs';

test('the command reference of @foliwake/cli is up to date', async () => {
  const [current, expected] = await renderReadme();
  assert.equal(current, expected, 'packages/cli/README.md is stale: run pnpm cli:reference');
});

test('the reference names the connect, servers and site commands', async () => {
  const [, expected] = await renderReadme();
  const headings = ['### `foliwake connect`', '### `foliwake servers use [server]`', '### `foliwake site link [id]`'];
  for (const heading of headings) assert.ok(expected.includes(heading), heading);
});
