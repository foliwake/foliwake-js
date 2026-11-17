# Changelog: @foliwake/site-check

`@foliwake/site-check` shares one version with the other packages of this repository and is released together
with them. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.3.1

### Patch Changes

- @foliwake/blocks-contract@0.3.1

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
