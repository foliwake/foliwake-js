// X-Foliwake-Blocks on .plain.html: parsed into the envelope; a version 3 config without app.blocks mounts the
// blocks module the page's code release names; version 2 keeps its own app.blocks. page.title is the first <h1>.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { parseFoliwakeConfig } from '@foliwake/server/config';
import { parseDiscovery } from '@foliwake/server/discovery';
import { createOriginClient } from '@foliwake/server/origin';
import { preparePage, readEnvelope } from '@foliwake/server/page';
import { configFromSnapshot } from '@foliwake/server/resolve';
import { CD, configText, startStubOrigin } from './helpers/stub-origin.js';
import { discoveryDoc } from './fixtures/discovery.js';

const BODY = '<h1>  Light\n <em>signals</em> </h1><div data-component="question"><p>Q</p></div>';
const HEADER = 'entry="scripts/blocks.js", contract=2, prefix="demo"';
const plain = (extra = {}, body = BODY) => ({
  headers: { 'content-type': 'text/html; charset=utf-8', 'x-code-release': CD, 'x-html-contract': '2', ...extra },
  body,
});

let stub;
before(async () => {
  stub = await startStubOrigin({
    '/a.plain.html': plain({ 'x-foliwake-blocks': HEADER }),
    '/later.plain.html': plain({ 'x-foliwake-blocks': `${HEADER}, later=1, x="y"` }),
    '/none.plain.html': plain({}, '<p>No heading</p>'),
    '/bad-entry.plain.html': plain({ 'x-foliwake-blocks': 'entry="../x.js", contract=2, prefix="demo"' }),
    '/bad-contract.plain.html': plain({ 'x-foliwake-blocks': 'entry="scripts/b.js", contract="2", prefix="demo"' }),
    '/bad-syntax.plain.html': plain({ 'x-foliwake-blocks': 'entry=scripts/b.js' }),
  });
});
after(() => stub?.close());

function v3Config() {
  const discovery = parseDiscovery(
    discoveryDoc({ live: { url: stub.origin }, preview: null, media: null }),
    stub.origin,
  );
  return configFromSnapshot({ url: stub.origin, discovery, file: null, text: null });
}

const V2_BLOCKS = { entry: 'scripts/app.js', eventPrefix: 'app' };
const v2Config = () => parseFoliwakeConfig(configText({ live: stub.origin, app: { blocks: V2_BLOCKS } }));
const read = (config, path) => readEnvelope(config, createOriginClient(config, {}), config.site, 'live', path);
const invalid = (error) => error.name === 'FoliwakePageError' && error.kind === 'invalid';

describe('the envelope', () => {
  test('carries the parsed header; unknown members are ignored', async () => {
    const config = v3Config();
    const expected = { entry: 'scripts/blocks.js', contract: 2, eventPrefix: 'demo' };
    assert.deepEqual((await read(config, '/a')).blocks, expected);
    assert.deepEqual((await read(config, '/later')).blocks, expected);
  });

  test('no header: null', async () => {
    assert.equal((await read(v3Config(), '/none')).blocks, null);
  });

  test('a bad header refuses the answer', async () => {
    const config = v3Config();
    for (const path of ['/bad-entry', '/bad-contract', '/bad-syntax'])
      await assert.rejects(read(config, path), invalid);
  });
});

describe('preparePage', () => {
  test('version 3 without app.blocks: the release names entry, contract and prefix', async () => {
    const config = v3Config();
    const page = preparePage(config, await read(config, '/a'));
    assert.equal(page.blocksUrl, `/foliwake/code/${CD}/scripts/blocks.js`);
    assert.equal(page.codeBase, `/foliwake/code/${CD}/`);
    assert.deepEqual(page.contract, { major: 2, eventPrefix: 'demo' });
  });

  test('version 3 without a header: the page stays static', async () => {
    const config = v3Config();
    const page = preparePage(config, await read(config, '/none'));
    assert.equal(page.blocksUrl, null);
  });

  test('version 2: app.blocks wins over the header', async () => {
    const config = v2Config();
    const envelope = { ...(await read(v3Config(), '/a')), site: config.site };
    const page = preparePage(config, envelope);
    assert.equal(page.blocksUrl, `/foliwake-code/${CD}/scripts/app.js`);
    assert.equal(page.contract.eventPrefix, 'app');
  });

  test('an envelope cached by an older version (no blocks key) still prepares', async () => {
    const config = v3Config();
    const { blocks, ...old } = await read(config, '/a');
    assert.ok(blocks);
    assert.equal(preparePage(config, old).blocksUrl, null);
  });

  test('title: the first <h1> text, whitespace collapsed; null without one', async () => {
    const config = v3Config();
    assert.equal(preparePage(config, await read(config, '/a')).title, 'Light signals');
    assert.equal(preparePage(config, await read(config, '/none')).title, null);
  });
});
