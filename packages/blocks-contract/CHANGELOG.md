# Changelog: @foliwake/blocks-contract

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/block-kit`, `@foliwake/site-check`,
`@foliwake/client`, `@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version
and are released together; each changelog lists the changes of its own package. While the version is 0.x, a
minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.3.1

No changes in this release.

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
  
  - **BREAKING** The contract is `foliwake-blocks/2` (was `/1`): `ContractVersion.major` is `2` and
    `package.json` carries `"foliwake": { "blocksContract": 2 }`. The core is project-agnostic: `HostCore`,
    `BlockHost<Ext>` for host extensions, `BlockEvents<Ext>`, `FoliwakeEvent<Events, T>`; the core events are
    only `ready` and `error`.
  - **BREAKING** The assessment types moved to the subpath `@foliwake/blocks-contract/assessment`: `Answer`,
    `SavedAnswer`, `Verdict`, `AssessmentMode`, `AssessmentHostMembers` (`mode`, `policy`, `saved`,
    `check`), `AssessmentHost` and `AssessmentEvents` (`select`, `check`, `answer`, `reset`,
    `complete`). They are no longer exported from the root.
  - **BREAKING** `host.mode` is the site's own token (`string`, optional); page data carries `mode: string | null`.
  - Added: `BlockMeta` (block name and `ui` labels) as the optional third argument of `BlockInit`; optional
    `host.react` (`HostReact`).
  - Added: `@foliwake/blocks-contract/import-map` with `pageImportMap`, the import map of a code release (module
    `foliwake` → the release's block kit); the package's only runtime code, browser-safe, shared by
    `@foliwake/client` and `@foliwake/server`.
  - The modules are built without source maps and carry no `sourceMappingURL`.
  - Published on npm (`publishConfig.access: public`, provenance); the GitHub Packages registry is no longer used.

### Patch Changes

- b0c16ac: Comments in the published modules cite public contracts only (no references to private planning documents).

## 0.2.0 and earlier (never published on npm)

0.1.0 was packed for review only (GitHub Packages setup); 0.2.0 was prepared but not published. The first
release on npm lists the changes since the first 0.1.0 tarballs (2026-11-11).
