# Changelog: @foliwake/block-kit

`@foliwake/block-kit` shares one version with the other packages of this repository and is released together
with them. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

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

- 2b0bb9f: The block kit's source is TypeScript (`src/block-kit.ts`): `dist/block-kit.js` is compiled from it (still one
  readable module importing only `./lit-html.js`), and the kit's declarations (`index.d.ts`, the standalone
  `foliwake.d.ts`) are generated from the same source instead of written by hand. Same API, same behaviour; the
  declarations add `lit-html.d.ts` and `block-kit.d.ts` next to the browser files.
- 1cc3743: Documentation: the READMEs name the kit's specifier `@foliwake/block-kit` everywhere, link to sibling
  packages instead of guides that are not public, and say which features need the Foliwake CLI, which is not
  public yet. The `@foliwake/next` README shows how to write the cached read yourself. The starters' loader comment names HTML contract 2. No API change.
- Updated dependencies [1cc3743]
- Updated dependencies [70af3e5]
  - @foliwake/blocks-contract@0.4.0

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
