---
"@foliwake/blocks-contract": minor
"@foliwake/block-kit": minor
"@foliwake/site-check": minor
"@foliwake/client": minor
"@foliwake/react": minor
"@foliwake/server": minor
"@foliwake/next": minor
"create-foliwake": minor
---

**BREAKING**: the old forms are removed; only the current ones remain.

- The kit's only specifier is `@foliwake/block-kit`. The import map of a code release no longer maps
  `foliwake`; `LEGACY_KIT_SPECIFIER` and `KIT_SPECIFIERS` are removed from `@foliwake/blocks-contract/import-map`
  (use `KIT_SPECIFIER`). `@foliwake/site-check` refuses a bare `foliwake` import, preload hints follow only
  `@foliwake/block-kit`, and new projects map only `@foliwake/block-kit` (jsconfig, Storybook).
- `@foliwake/block-kit/block-kit-1.js` (the kit of blocks contract 1) is removed, with its `exports` entry;
  `@foliwake/site-check` no longer treats `_foliwake/block-kit-1.js` as an engine file, and the Storybook
  starter no longer aliases relative `_foliwake/` imports.
- An origin answer without `X-Code-Release` is an error (`FoliwakePageError` `invalid`), not a body shown
  without blocks. `codeRelease` of `PageEnvelope` and `FoliwakePageData` is `CodeReleaseId` (never null),
  and the client error code `NO_CODE_RELEASE` is removed.
- A `foliwake.remote.json` with any `version` other than 2 is refused with one "unsupported version" error.

Added (not breaking): `defineBlock(name, setup, { autoReady: false })` in `@foliwake/block-kit`. The kit then
sends `ready` only when the block sends it (`ctx.emit('ready', …)`), so a setup that cannot run leaves the root
without `ready`. The default (`autoReady: true`) is unchanged: after a setup that did not send `ready`, the kit
sends it.
