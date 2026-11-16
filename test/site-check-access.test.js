// access.yaml: strict parsing, and deny-wins matching with closed by default (ported from the engine's tests).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accessGlobProblem, isOpenPath, parseAccessConfig } from '@foliwake/site-check/formats/access';
import { problemText } from './helpers/site-check.js';

const parse = (text) => parseAccessConfig(Buffer.from(text));

test('an allowed path is open, a deny always wins, everything else is closed', () => {
  const { config } = parse(
    'version: 1\nallow: ["/ge/**", "/about", "/lessons/free"]\ndeny: ["/ge/private/**", "/lessons/**"]\n',
  );
  assert.ok(isOpenPath(config, '/ge'));
  assert.ok(isOpenPath(config, '/ge/ru'));
  assert.ok(isOpenPath(config, '/about'));
  assert.ok(!isOpenPath(config, '/ge/private'));
  assert.ok(!isOpenPath(config, '/ge/private/x'));
  assert.ok(!isOpenPath(config, '/lessons/free'), 'a deny beats a more specific allow');
  assert.ok(!isOpenPath(config, '/other'));
  assert.ok(!isOpenPath(config, '/'));
});

test('no rules means closed; rules can name dotted paths', () => {
  assert.ok(!isOpenPath(null, '/'));
  const { config } = parse('version: 1\nallow: ["/", "/catalog.json", "/sitemap.xml"]\n');
  assert.ok(isOpenPath(config, '/'));
  assert.ok(isOpenPath(config, '/catalog.json'));
  assert.ok(!isOpenPath(config, '/catalog'));
  assert.ok(isOpenPath(parse('version: 1\ndeny: []\n').config, '/x') === false);
});

test('invalid files are refused with every problem reported', () => {
  for (const [text, expected] of [
    ['allow: ["/x"]\n', /version/],
    ['version: 2\n', /version/],
    ['version: 1\nallow: "/x"\n', /must be a list/],
    ['version: 1\nallow: ["x"]\n', /must start with/],
    ['version: 1\nunknown: 1\n', /unknown key/],
    ['version: 1\nallow: ["/a/"]\n', /empty segment/],
    ['version: 1\nallow: ["/a**"]\n', /\*\* inside/],
    ['version: 1\nallow: ["/media/**"]\n', /reserved prefix/],
    ['version: 1\nallow: ["/code/x"]\n', /reserved prefix/],
    ['version: 1\nallow: ["/%2e"]\n', /may only use/],
    ['version: 1\nallow: ["/.hidden"]\n', /may only use/],
    ['- a\n', /mapping/],
  ]) {
    const { problems, config } = parse(text);
    assert.equal(config, undefined, text);
    assert.match(problems.map(problemText).join('\n'), expected, text);
  }
  assert.ok(parseAccessConfig(new Uint8Array([0xff, 0xfe])).problems);
  assert.ok(parseAccessConfig(new Uint8Array(70 * 1024)).problems);
  assert.equal(accessGlobProblem('/ok/**'), null);
});
