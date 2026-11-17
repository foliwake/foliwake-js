# Changelog: create-foliwake

`create-foliwake` shares one version with the `@foliwake/*` packages of this repository and is released together
with them. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.3.1

### Patch Changes

- Updated dependencies [2b0bb9f]
  - @foliwake/block-kit@0.3.1
  - @foliwake/site-check@0.3.1

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
- b0c16ac: New package `create-foliwake`: `npm create foliwake@latest` (also `npx`, `pnpm`, `yarn` and `bun create`). The
  create command of the Foliwake CLI without its server step: the starters (inside the package), questions, flags
  and write guarantees, plus `--install` for Storybook's packages (the only network step). The planned project is
  checked with `@foliwake/site-check` before anything is written; its "Frontend checks" workflow runs
  `npx -y @foliwake/site-check@<version> . --format github`. React for the starters is vendored when the package is
  built. The project gets the types of `foliwake` for editors (`.foliwake/types/foliwake.d.ts`, from
  `@foliwake/block-kit`) and the JSON Schema of block definitions, both git-ignored. `createProject()` and
  `create-foliwake/starters` for the Foliwake CLI's `foliwake create`.
  `@foliwake/site-check`: license and notice files next to code (`scripts/vendor/react.LICENSE.txt`) are neither
  captured nor noted.

### Patch Changes

- Updated dependencies [b0c16ac]
- Updated dependencies
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
  - @foliwake/block-kit@0.3.0
  - @foliwake/site-check@0.3.0

## 0.2.0 and earlier (never published on npm)

The package did not exist yet; it is first released with the shared version after 0.2.0.
