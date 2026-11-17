# Changelog: @foliwake/next

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/block-kit`, `@foliwake/site-check`,
`@foliwake/client`, `@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version
and are released together; each changelog lists the changes of its own package. While the version is 0.x, a
minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.3.1

### Patch Changes

- @foliwake/blocks-contract@0.3.1
  - @foliwake/react@0.3.1
  - @foliwake/server@0.3.1

## 0.3.0

### Minor Changes

- b0c16ac: First release on npm, together with the new `@foliwake/site-check` and `create-foliwake` (one shared
  version). The changes since the first 0.1.0 tarballs:
  
  - **BREAKING** Through `@foliwake/react`: block events are delivered only when listed in the `events` prop
    (core `ready`/`error` always); contract `foliwake-blocks/2`; assessment types come from
    `@foliwake/blocks-contract/assessment`.
  - **BREAKING** Through `@foliwake/server`: page `mode` is a site token (none by default), the stricter page path
    grammar, `https` media base for the CSP.
  - Added: `<FoliwakeImportMap>` and a `nonce` prop on `<FoliwakeServerPage>`; the server renders the page's
    import map and hints block modules as `preload as=script`.
  - Added (via `@foliwake/server`): `service-token` origin auth in `foliwake.remote.json`; `.svg` media through
    `mediaRoute` with the sandbox CSP.
  - Fixed: imports `next/cache.js`, `next/navigation.js` and `next/server.js` fully specified, so apps that
    import `@foliwake/next` under Node ESM (vitest) resolve them (`next` 16.2 has no `exports` map).
  - Built without source maps.

### Patch Changes

- Updated dependencies
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
  - @foliwake/blocks-contract@0.3.0
  - @foliwake/server@0.3.0
  - @foliwake/react@0.3.0

## 0.2.0 and earlier (never published on npm)

0.1.0 was packed for review only (GitHub Packages setup); 0.2.0 was prepared but not published. The first
release on npm lists the changes since the first 0.1.0 tarballs (2026-11-11).
