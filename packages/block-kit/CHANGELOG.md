# Changelog: @foliwake/block-kit

`@foliwake/block-kit` shares one version with the other packages of this repository and is released together
with them. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.3.1

### Patch Changes

- 2b0bb9f: The block kit's source is TypeScript (`src/block-kit.ts`): `dist/block-kit.js` is compiled from it (still one
  readable module importing only `./lit-html.js`), and the kit's declarations (`index.d.ts`, the standalone
  `foliwake.d.ts`) are generated from the same source instead of written by hand. Same API, same behaviour; the
  declarations add `lit-html.d.ts` and `block-kit.d.ts` next to the browser files.
- @foliwake/blocks-contract@0.3.1

## 0.3.0

### Minor Changes

- b0c16ac: New package: the block kit of the Foliwake engine (the module `foliwake` that site blocks import: `defineBlock`,
  `html`, `nothing`), the legacy `block-kit-1.js` and the vendored lit-html 3.3.3, with the same behaviour, as the
  browser files the engine adds to every code release. New: `readFields(root)` is exported. Types: the kit's
  declarations (also standalone, `@foliwake/block-kit/foliwake.d.ts`, for site folders without node_modules) and the
  blocks contract's types re-exported, including the assessment extension (`@foliwake/block-kit/assessment`); the
  init `defineBlock` returns takes the contract's host (`HostMembers`), so it is a `ContractBlockInit` for any host
  extension.
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

### Patch Changes

- Updated dependencies
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
  - @foliwake/blocks-contract@0.3.0

## 0.2.0 and earlier (never published on npm)

The package did not exist yet; it is first released with the shared version after 0.2.0.
