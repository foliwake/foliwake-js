# Changelog: @foliwake/client

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/block-kit`, `@foliwake/site-check`,
`@foliwake/client`, `@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version
and are released together; each changelog lists the changes of its own package. While the version is 0.x, a
minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.3.0

### Minor Changes

- The kit's specifier is `@foliwake/block-kit`, the npm name of the kit (`KIT_SPECIFIER`); the import map of a code
  release maps it and, for one more minor version, the previous `foliwake` (`LEGACY_KIT_SPECIFIER`, deprecated) to
  the release's kit. `@foliwake/client` adds that map, `@foliwake/server` follows both specifiers in preload hints,
  `@foliwake/site-check` accepts both in the reference scan, and the starters of `create-foliwake` import
  `@foliwake/block-kit`.
  
  A block may declare the major of the blocks contract it speaks: `BlockInit` has an optional `contract`, the block
  kit's `defineBlock` sets `init.contract = 2`, and the starters' loader refuses another major
  (`LOADER_BLOCK_CONTRACT`); a block that declares none is accepted. The loader always passes `host` (required in
  the contract's `BlockInit`); the kit's init takes `host?` with the browser's fallbacks.
  
  The kit's types of `ctx.mount` are `ViewAdapter`, `ViewHandle` and `ViewOptions`, so the contract's `MountHandle`
  is re-exported under its own name. Reserved (not implemented): `shell: 'web-component'` (`KnownShell`), the
  context key `'foliwake:host'`, and the loader's attributes as values (`@foliwake/blocks-contract/reserved`:
  `BLOCK_ATTRIBUTES`, `KNOWN_SHELLS`, `HOST_CONTEXT_KEY`).
- b0c16ac: First release on npm, together with the new `@foliwake/site-check` and `create-foliwake` (one shared
  version). The changes since the first 0.1.0 tarballs:
  
  First release. The package did not exist when the first 0.1.0 tarballs were packed; it was split out of
  `@foliwake/react` afterwards (its in-repository 0.1.0 was never published).
  
  - The framework-free browser client: `mountFoliwakePage` (body, host, block events, abort guards, block CSS,
    `update()`/`dispose()`), `createHost`, `subscribeBlockEvents`, `listenBlockEvents`, `cssMounts`, hooks.
    No framework dependency; `@foliwake/react` is a thin wrapper of it.
  - Block events are delivered only when the app lists them: the core events `ready` and `error` always, any
    other type (such as `answer` from the assessment extension) only when named in `events`.
    `BLOCK_EVENT_TYPES` is `['ready', 'error']`. Changing `events` through `update()` re-subscribes.
  - `createHost` reads extension members at call time (never after dispose) and returns `CreatedHost<Ext>`
    (extension members optional); `host.react` is forwarded when the app gives it.
  - The mount inserts the page's scoped import map (module `foliwake`); option `nonce` for a CSP nonce.
  - Built without source maps.

### Patch Changes

- b0c16ac: Comments in the published modules cite public contracts only (no references to private planning documents).
- Updated dependencies
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
  - @foliwake/blocks-contract@0.3.0

## 0.2.0 and earlier (never published on npm)

0.1.0 was packed for review only (GitHub Packages setup); 0.2.0 was prepared but not published. The first
release on npm lists the changes since the first 0.1.0 tarballs (2026-11-11).
