# Changelog: @foliwake/react

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/block-kit`, `@foliwake/site-check`,
`@foliwake/client`, `@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version
and are released together; each changelog lists the changes of its own package. While the version is 0.x, a
minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.8.0

### Patch Changes

- @foliwake/blocks-contract@0.8.0
  - @foliwake/client@0.8.0

## 0.7.0

### Patch Changes

- @foliwake/blocks-contract@0.7.0
  - @foliwake/client@0.7.0

## 0.6.0

### Patch Changes

- @foliwake/blocks-contract@0.6.0
  - @foliwake/client@0.6.0

## 0.5.0

### Patch Changes

- fa06260: The `homepage` of every package is its page on the public SDK documentation site,
  `https://sdk.foliwake.dev/reference/packages/<name>`. No API change.
- Updated dependencies [fa06260]
  - @foliwake/blocks-contract@0.5.0
  - @foliwake/client@0.5.0

## 0.4.0

### Minor Changes

- 70af3e5: **BREAKING**: the old forms are removed; only the current ones remain.
  
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

### Patch Changes

- 1cc3743: Documentation: the READMEs name the kit's specifier `@foliwake/block-kit` everywhere, link to sibling
  packages instead of guides that are not public, and say which features need the Foliwake CLI, which is not
  public yet. The `@foliwake/next` README shows how to write the cached read yourself. The starters' loader comment names HTML contract 2. No API change.
- Updated dependencies [1cc3743]
- Updated dependencies [70af3e5]
  - @foliwake/blocks-contract@0.4.0
  - @foliwake/client@0.4.0

## 0.3.0

### Minor Changes

- b0c16ac: First release on npm, together with the new `@foliwake/site-check` and `create-foliwake` (one shared
  version). The changes since the first 0.1.0 tarballs:
  
  - **BREAKING** Block events reach `<FoliwakePage onEvent>` and `useFoliwakeEvents` only when the host lists
    them: the core events `ready` and `error` always, any other type only when named in the `events` prop
    (for example `events={['answer'] as const}`). 0.1.0 delivered all seven event types. `BLOCK_EVENT_TYPES` is
    now `['ready', 'error']`. `<FoliwakePage>` and `useFoliwakeEvents` are generic over the event map.
  - **BREAKING** `Answer`, `SavedAnswer` and `Verdict` are no longer re-exported; import them from
    `@foliwake/blocks-contract/assessment`. Contract `foliwake-blocks/2` (see `@foliwake/blocks-contract`).
  - **BREAKING** The package is a thin wrapper of the new `@foliwake/client` (a new dependency), which now holds
    the mount lifecycle; `listenBlockEvents`, `BLOCK_EVENT_TYPES`, `HOST_CONTRACT_MINOR` and `cssMounts` are
    re-exported from it.
  - Added: `nonce` prop (CSP nonce of the page's import map); types `CreatedHost`, `FoliwakeHooks`,
    `BlockEvents`, `HostCore`, `MountReport`, `MountStatus` re-exported.
  - Built without source maps.

### Patch Changes

- b0c16ac: Comments in the published modules cite public contracts only (no references to private planning documents).
- Updated dependencies
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
  - @foliwake/blocks-contract@0.3.0
  - @foliwake/client@0.3.0

## 0.2.0 and earlier (never published on npm)

0.1.0 was packed for review only (GitHub Packages setup); 0.2.0 was prepared but not published. The first
release on npm lists the changes since the first 0.1.0 tarballs (2026-11-11).
