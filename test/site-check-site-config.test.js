// site.yaml: strict parsing (ported from the engine's tests; reading it with the site code: site-check-site-code).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSiteConfig } from '@foliwake/site-check/formats/site-config';
import { problemText } from './helpers/site-check.js';

const parse = (text) => parseSiteConfig(Buffer.from(text));

test('a valid file gives the default dialect; no authoring key gives no default', () => {
  assert.deepEqual(parse('version: 1\nauthoring: blocks-v3\n').config, { authoring: 'blocks-v3', blocks: null });
  assert.deepEqual(parse('version: 1\nauthoring: blocks-v2\n').config, { authoring: 'blocks-v2', blocks: null });
  assert.deepEqual(parse('version: 1\n').config, { authoring: null, blocks: null });
  const blocks = 'version: 1\nblocks:\n  entry: scripts/blocks.js\n  contract: 2\n  eventPrefix: demo\n';
  assert.deepEqual(parse(blocks).config.blocks, { entry: 'scripts/blocks.js', contract: 2, eventPrefix: 'demo' });
});

test('invalid files are refused, naming the problem', () => {
  for (const [text, expected] of [
    ['authoring: blocks-v3\n', /version/],
    ['version: 2\nauthoring: blocks-v3\n', /version/],
    ['version: "1"\n', /version/],
    ['version: 1\nauthoring:\n', /authoring/],
    ['version: 1\nauthoring: ""\n', /authoring/],
    ['version: 1\nauthoring: blocks-v9\n', /blocks-v9/],
    ['version: 1\nauthoring: [blocks-v3]\n', /authoring/],
    ['version: 1\ntheme: dark\n', /unknown key "theme"/],
    ['- a\n', /mapping/],
    ['', /mapping/],
    ['version: 1\nversion: 1\n', /./],
  ]) {
    const { problems, config } = parse(text);
    assert.equal(config, undefined, text);
    assert.match(problems.map(problemText).join('\n'), expected, text);
  }
  assert.ok(parseSiteConfig(new Uint8Array([0xff, 0xfe])).problems, 'not UTF-8');
  assert.ok(parse(`version: 1\n# ${'x'.repeat(70 * 1024)}\n`).problems, 'too large');
});
