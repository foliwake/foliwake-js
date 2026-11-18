// @foliwake/next/cache: the generation floor decides the lifetime of a cached answer (generation-floor, without
// Next: the cached read calls cacheLife with what entryLifetime returns).
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import {
  BEHIND_FLOOR_LIFETIME,
  behindFloor,
  entryLifetime,
  setGenerationFloor,
} from '../packages/next/dist/generation-floor.js';

const envelope = (generation) => ({
  site: 'demo',
  channel: 'live',
  path: '/lessons/x',
  html: '<p>x</p>',
  codeRelease: 'local',
  htmlContract: '2',
  lang: null,
  pageId: null,
  etag: null,
  generation,
});
const found = (generation) => ({ found: true, envelope: envelope(generation) });
const NORMAL = { stale: 300, revalidate: 300, expire: 86_400 };
const quiet = { warn() {} };

afterEach(() => setGenerationFloor(null));

describe('entryLifetime', () => {
  test('without a floor: the normal lifetime', async () => {
    assert.deepEqual(await entryLifetime(found(1), 300), NORMAL);
  });

  test('below the floor: 15 s, no throw', async () => {
    setGenerationFloor(async () => 418);
    assert.deepEqual(await entryLifetime(found(417), 300), BEHIND_FLOOR_LIFETIME);
    assert.deepEqual(BEHIND_FLOOR_LIFETIME, { stale: 1, revalidate: 1, expire: 15 });
  });

  test('at or above the floor: the normal lifetime', async () => {
    setGenerationFloor(async () => 418);
    assert.deepEqual(await entryLifetime(found(418), 300), NORMAL);
    assert.deepEqual(await entryLifetime(found(500), 300), NORMAL);
  });

  test('a not-found entry keeps the normal lifetime', async () => {
    setGenerationFloor(async () => 418);
    assert.deepEqual(await entryLifetime({ found: false, path: '/lessons/x' }, 300), NORMAL);
  });

  test('the floor is asked for the envelope site', async () => {
    const asked = [];
    setGenerationFloor(async (site) => (asked.push(site), null));
    assert.deepEqual(await entryLifetime(found(1), 60), { stale: 60, revalidate: 60, expire: 86_400 });
    assert.deepEqual(asked, ['demo']);
  });
});

describe('behindFloor fails open', () => {
  test('a floor that throws: not behind, logged', async () => {
    const logged = [];
    setGenerationFloor(async () => {
      throw new Error('database down');
    });
    assert.equal(await behindFloor(envelope(1), { warn: (m) => logged.push(m) }), false);
    assert.match(logged[0], /could not be read/);
  });

  test('an answer without a generation: not behind, logged', async () => {
    const logged = [];
    setGenerationFloor(async () => 418);
    assert.equal(await behindFloor(envelope(null), { warn: (m) => logged.push(m) }), false);
    assert.match(logged[0], /without X-Site-Generation/);
  });

  test('no floor known yet (null): not behind', async () => {
    setGenerationFloor(async () => null);
    assert.equal(await behindFloor(envelope(1), quiet), false);
  });

  test('the registration is shared through globalThis', async () => {
    setGenerationFloor(async () => 5);
    assert.equal(typeof globalThis[Symbol.for('@foliwake/next.generationFloor')], 'function');
    assert.equal(await behindFloor(envelope(4), quiet), true);
  });
});
