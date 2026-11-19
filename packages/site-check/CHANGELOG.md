# Changelog: @foliwake/site-check

`@foliwake/site-check` shares one version with the other packages of this repository and is released together
with them. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.10.1

### Patch Changes

- @foliwake/blocks-contract@0.10.1

## 0.10.0

### Minor Changes

- 339fb47: A page's code release names its blocks module. `readEnvelope` reads `X-Foliwake-Blocks`
  (`entry="scripts/blocks.js", contract=2, prefix="demo"`) into `envelope.blocks`; with a version 3 config without
  `app.blocks`, `preparePage` mounts that entry with its contract and event prefix (`app.blocks` still wins, and a
  version 2 config is unchanged). Preload hints follow the page's entry. `FoliwakePageData.title` is the text of the
  body's first `<h1>`. `@foliwake/site-check` accepts and checks the optional `blocks` key of
  `components/components.json` with the engine's rule (an entry under scripts, components or _foliwake ending in .js
  that exists, a contract major, an event prefix).
- 0bb04d6: `site.yaml` may name the blocks module an embedding app loads: `blocks: { entry, contract, eventPrefix }`. A site
  whose `components/components.json` is generated from its block folders gets it in the generated descriptor (the
  engine sends it as `X-Foliwake-Blocks`); the entry must exist. With a hand-written descriptor the key belongs there,
  and naming it in both places is `SITE_CONFIG_INVALID`.

### Patch Changes

- Updated dependencies [339fb47]
  - @foliwake/blocks-contract@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [6dd1fd4]
  - @foliwake/blocks-contract@0.9.0

## 0.8.0

### Patch Changes

- @foliwake/blocks-contract@0.8.0

## 0.7.0

### Patch Changes

- @foliwake/blocks-contract@0.7.0

## 0.6.0

### Patch Changes

- @foliwake/blocks-contract@0.6.0

## 0.5.0

### Patch Changes

- fa06260: The `homepage` of every package is its page on the public SDK documentation site,
  `https://sdk.foliwake.dev/reference/packages/<name>`. No API change.
- Updated dependencies [fa06260]
  - @foliwake/blocks-contract@0.5.0

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

- Updated dependencies [1cc3743]
- Updated dependencies [70af3e5]
  - @foliwake/blocks-contract@0.4.0

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
- b0c16ac: The CLI `foliwake-site-check` (`npx @foliwake/site-check [dir]`): text, `--json` (schema
  `foliwake-site-check/1`) or `--format github` (Actions annotations), `--strict`, `--quiet`; exit status 0 (no
  errors), 1 (errors; warnings too with `--strict`), 2 (usage).
- b0c16ac: New package. `@foliwake/site-check/formats/*`: the rules of the files a site's code repository holds, moved out
  of the Foliwake engine with the same behaviour, as modules without Node imports (the platform's origin and edge
  Worker import them): constants, code file types, the layout of site code (`CODE_ROOTS`, `CODE_ROOT_FILES`,
  `isCapturedInput`, `REQUIRED_FILES`, `GENERATED_FILES`, `ENGINE_RELEASE_FILES`, `CODE_LIMITS`), the strict YAML
  reader, `site.yaml`, `query.yaml` (`foliwake-query/1`), `access.yaml`, page templates (`foliwake-templates/1`),
  the component descriptor, the diagnostic form (with a third severity, `info`) and `jsonPointerPosition`.
  `parseSiteConfig`, `parseQueryConfig` and `parseAccessConfig` report problems as `{ line, column, field, message }`.
- b0c16ac: The checks of site code: block definitions (`blocks/pack`, `blocks/authoring-keys`, `blocks/extras`,
  `blocks/editor-config`), the JSON Schema of a block definition (`blocks/schema`), block example files
  (`blocks/examples`), reference tables (`references/tables`), link URLs (`urls`), the site code reader
  (`site-code`), the descriptor check and the reference scan of scripts and stylesheets. `checkCodeRelease(files)`
  and `checkSiteCode(dir)` return one sorted list of diagnostics with the captured and ignored files. New codes:
  `CODE_FILE_REQUIRED`, `CODE_FILE_GENERATED`, `CODE_REFERENCE_NOT_RELATIVE`, `CODE_REFERENCE_OUTSIDE`,
  `CODE_REFERENCE_MISSING`, `CODE_PATH_IGNORED` (info), `CODE_FOLDER_NAME_INVALID`, `CODE_FILE_TOO_LARGE` and
  `CODE_RELEASE_TOO_LARGE` (warnings for now: 2 MiB per file, 30 MiB and 2000 files per release),
  `QUERY_CONFIG_INVALID` and `ACCESS_CONFIG_INVALID` with a line, column and field.

### Patch Changes

- Updated dependencies
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
  - @foliwake/blocks-contract@0.3.0

## 0.2.0 and earlier (never published on npm)

The package did not exist yet; it is first released with the shared version after 0.2.0.
