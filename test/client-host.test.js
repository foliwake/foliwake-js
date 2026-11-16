// createHost of @foliwake/client and @foliwake/react (foliwake-blocks/2): the optional `react` member is the app's
// React, forwarded as given, read at call time and announced by has('react'); an extension's members (the
// assessment's `saved`, `check`, `policy`) are read through from the app at call time and never called after dispose.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHost } from '../packages/client/dist/index.js';
import { createHost as createReactHost } from '../packages/react/dist/index.js';

const page = { contract: { major: 2, eventPrefix: 'demo' }, htmlContract: '2', channel: 'live', mode: null, lang: 'en' };
const react = { createElement: () => null, createRoot: () => ({ render() {}, unmount() {} }) };

test('host.react: absent unless the app gives it; forwarded as given and read at call time', () => {
  for (const make of [createHost, createReactHost]) {
    const signal = new AbortController().signal;
    assert.equal(make({}, { signal, page }).has('react'), false);
    assert.equal(make({}, { signal, page }).react, undefined);
    let init = {};
    const host = make(() => init, { signal, page });
    assert.equal(host.has('react'), false);
    init = { react };
    assert.equal(host.has('react'), true, 'read at call time');
    assert.equal(host.react, react, 'the app\'s object, not a copy');
  }
});

test('the core host: contract 2.0, no mode unless the page or the app gives one', () => {
  const signal = new AbortController().signal;
  const host = createHost({}, { signal, page });
  assert.deepEqual(host.contract, { major: 2, minor: 0 });
  assert.equal(host.mode, undefined);
  assert.equal(host.has('mode'), false);
  assert.equal(createHost({}, { signal, page: { ...page, mode: 'print' } }).mode, 'print');
  const app = createHost({ mode: 'review' }, { signal, page: { ...page, mode: 'print' } });
  assert.equal(app.mode, 'review', 'the app wins over the page');
  assert.equal(app.has('mode'), true);
  for (const name of ['saved', 'check', 'policy']) assert.equal(name in host, false, `${name} is no core member`);
});

test('extension members: read through at call time, announced by has(), not called after dispose', () => {
  for (const make of [createHost, createReactHost]) {
    const controller = new AbortController();
    const calls = [];
    let init = {};
    const host = make(() => init, { signal: controller.signal, page });
    assert.equal(host.has('saved'), false);
    assert.equal(host.saved, undefined);
    const app = {
      answers: { k1: { selected: ['a'], correct: true } },
      saved(key) {
        calls.push(key);
        return this.answers[key] ?? null;
      },
      policy: { retry: false },
    };
    init = app;
    assert.equal(host.has('saved'), true, 'read at call time');
    assert.equal('saved' in host, true);
    assert.deepEqual(host.saved('k1'), { selected: ['a'], correct: true }, 'called with the app object as this');
    assert.equal(host.policy, app.policy, 'a value as given');
    assert.equal(host.has('policy'), true);
    assert.equal(host.has('check'), false);
    controller.abort();
    assert.equal(host.saved('k1'), undefined, 'nothing after dispose');
    assert.deepEqual(calls, ['k1']);
  }
});

test('an extension function kept by a block calls the app\'s latest one, and nothing once the app gives none or after dispose', () => {
  const controller = new AbortController();
  const calls = [];
  let init = {
    saved(key) {
      calls.push(['first', key]);
      return null;
    },
  };
  const host = createHost(() => init, { signal: controller.signal, page });
  const kept = host.saved;
  kept('k1');
  init = {
    answers: { k2: { selected: ['b'], correct: false } },
    saved(key) {
      calls.push(['second', key]);
      return this.answers[key] ?? null;
    },
  };
  assert.deepEqual(kept('k2'), { selected: ['b'], correct: false }, 'the latest implementation, with its own object as this');
  init = {};
  assert.equal(kept('k3'), undefined, 'the app no longer gives it');
  init = { saved: () => calls.push(['after']) };
  controller.abort();
  assert.equal(kept('k4'), undefined);
  assert.deepEqual(calls, [['first', 'k1'], ['second', 'k2']]);
});
