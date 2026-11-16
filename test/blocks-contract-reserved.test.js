// The names the blocks contract reserves as values (attributes, shells, the host's context key) and the import
// map of a code release: the kit under `@foliwake/block-kit` and, for one more minor version, under `foliwake`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  KIT_PATH,
  KIT_SPECIFIER,
  KIT_SPECIFIERS,
  LEGACY_KIT_SPECIFIER,
  pageImportMap,
} from '@foliwake/blocks-contract/import-map';
import { BLOCK_ATTRIBUTES, HOST_CONTEXT_KEY, KNOWN_SHELLS } from '@foliwake/blocks-contract/reserved';

test('the import map maps both kit specifiers to the release kit, in a scope of the release', () => {
  assert.equal(KIT_SPECIFIER, '@foliwake/block-kit');
  assert.equal(LEGACY_KIT_SPECIFIER, 'foliwake');
  assert.deepEqual(KIT_SPECIFIERS, ['@foliwake/block-kit', 'foliwake']);
  const base = '/foliwake-code/cd_1/';
  const kit = `${base}${KIT_PATH}`;
  const map = { scopes: { [base]: { '@foliwake/block-kit': kit, foliwake: kit } } };
  assert.deepEqual(JSON.parse(pageImportMap({ codeBase: base })), map);
  assert.equal(pageImportMap({ codeBase: null }), null);
  assert.doesNotMatch(pageImportMap({ codeBase: '/a</script>/' }), /</);
});

test('reserved names: the loader attributes, the shells with web-component, the host context key', () => {
  assert.deepEqual(BLOCK_ATTRIBUTES, {
    component: 'data-component',
    status: 'data-component-status',
    key: 'data-block-key',
    css: 'data-component-css',
    codeRelease: 'data-code-release',
  });
  assert.deepEqual(KNOWN_SHELLS, ['next', 'react', 'foliwake', 'webview', 'web-component']);
  assert.equal(HOST_CONTEXT_KEY, 'foliwake:host');
  assert.ok(Object.isFrozen(BLOCK_ATTRIBUTES) && Object.isFrozen(KNOWN_SHELLS));
});
