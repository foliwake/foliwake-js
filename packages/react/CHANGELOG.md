# Changelog: @foliwake/react

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/block-kit`, `@foliwake/site-check`,
`@foliwake/client`, `@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version
and are released together; each changelog lists the changes of its own package. While the version is 0.x, a
minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.3.1

### Patch Changes

- @foliwake/blocks-contract@0.3.1
  - @foliwake/client@0.3.1

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
