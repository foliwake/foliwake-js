// @foliwake/next/page: the ready page route. Its Next-free parts directly (path, mount, metadata, missing pages);
// the route component itself needs Next's bundler (a client reference) and is covered by the example app (S8).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkMount, checkPageChannel, metadataOf, mountRewriter, pagePathOf, readOrNull } from '../packages/next/dist/page-route.js';

const pageError = (kind) => Object.assign(new Error(kind), { name: 'FoliwakePageError', kind });

describe('page-route', () => {
  test('channel: live by default; preview only with an author check', () => {
    assert.equal(checkPageChannel(undefined, undefined), 'live');
    assert.equal(checkPageChannel('preview', () => true), 'preview');
    assert.throws(() => checkPageChannel('preview', undefined), /needs authorize/);
    assert.throws(() => checkPageChannel('draft', undefined), /channel/);
  });

  test('pagePathOf: segments to a page path', () => {
    assert.equal(pagePathOf(undefined), '/');
    assert.equal(pagePathOf([]), '/');
    assert.equal(pagePathOf(['lessons', 'a']), '/lessons/a');
  });

  test('mounts: root keeps links; /pages prefixes them', () => {
    assert.equal(checkMount(undefined), null);
    assert.equal(checkMount('/'), null);
    assert.equal(mountRewriter(null), undefined);
    const rewrite = mountRewriter(checkMount('/pages'));
    assert.equal(rewrite('/'), '/pages');
    assert.equal(rewrite('/lessons/a'), '/pages/lessons/a');
    for (const bad of ['pages', '/Pages', '/pages/', '/a b']) assert.throws(() => checkMount(bad), /mount/);
  });

  test('metadata: the first heading as title; noindex for preview; nothing for a missing page', () => {
    assert.deepEqual(metadataOf({ title: 'Light signals' }, 'live'), { title: 'Light signals' });
    assert.deepEqual(metadataOf({ title: null }, 'live'), {});
    assert.deepEqual(metadataOf(null, 'preview'), { robots: { index: false, follow: false } });
  });

  test('readOrNull: not_found and not_allowed are null; other errors throw', async () => {
    assert.equal(await readOrNull(async () => { throw pageError('not_found'); }), null);
    assert.equal(await readOrNull(async () => { throw pageError('not_allowed'); }), null);
    await assert.rejects(readOrNull(async () => { throw pageError('origin'); }), /origin/);
    assert.deepEqual(await readOrNull(async () => ({ title: 'x' })), { title: 'x' });
  });
});
