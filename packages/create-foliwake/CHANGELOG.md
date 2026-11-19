# Changelog: create-foliwake

`create-foliwake` shares one version with the `@foliwake/*` packages of this repository and is released together
with them. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.10.1

### Patch Changes

- e448fbb: The starter blocks' stylesheets (`note`, `quiz`, `steps`) give every site variable a fallback, so the blocks keep
  their styles inside an app that embeds the page: an app loads `components/<name>/<name>.css` but not the site's
  `styles/styles.css` where `--color-accent` and the other variables are defined, and a `var()` without a fallback
  dropped its declaration (the note's border was missing in a Next app). The docs say why, and troubleshooting
  covers it and an app's unlayered reset that wins over `@layer blocks`.
- @foliwake/block-kit@0.10.1
  - @foliwake/site-check@0.10.1

## 0.10.0

### Patch Changes

- Updated dependencies [339fb47]
- Updated dependencies [0bb04d6]
  - @foliwake/site-check@0.10.0
  - @foliwake/block-kit@0.10.0

## 0.9.0

### Minor Changes

- 5a7ffdf: A new project's `foliwake.config.json` is a minimal project file: the site id, `code.root` and the local `content/`
  source, without `storage`, `stateDir` or hosts (the engine defaults them for a local project). It names no
  address and no credential, so `foliwake config trust` is not needed for it.
  
  The starter's `site.yaml` no longer sets `authoring: blocks-v3` as the site's default dialect: a site with a Drupal
  or Google Docs source refuses that default (their pages cannot be written in blocks-v3), so every code preparation
  failed once such a source was added. The starter's pages name `authoring: blocks-v3` in their front matter instead.
  
  README: branch preview addresses with `--<org>` (`<branch>--<site>--<org>.<branch host domain>`), the open
  `@foliwake/cli` for the server commands (the local preview still needs the engine), `account keys create` with its
  required `--label`, and the repository step as `foliwake connect` / `site create --repository` (a public
  repository needs no code token).

### Patch Changes

- @foliwake/block-kit@0.9.0
  - @foliwake/site-check@0.9.0

## 0.8.0

### Minor Changes

- 7e70573: The starter's GitHub workflows deploy with the open CLI instead of an SSH forced command: production runs
  `npx @foliwake/cli@<version> code deploy`, branch previews `branch update` / `branch delete`, with the repository
  variable `FOLIWAKE_SERVER` and the secret `FOLIWAKE_TOKEN` (a CI key from `foliwake account keys create --site`).
  The CLI version is pinned exactly in the new project's `package.json` field `"foliwake": { "cli": "<version>" }`
  (create's own release); the workflows read it and refuse anything but an exact version. It is not a
  `devDependency`, so `npm install` never puts a `foliwake` into `node_modules/.bin` that would shadow the developer's
  own CLI in `npm run dev`, `check:pages` or `stories` (install a CLI globally: `npm i -g @foliwake/cli`, or the
  engine CLI). The README shows a Renovate custom regex manager that bumps the field. The SSH secrets, the
  `foliwake-request` action and `foliwake-report.py` are gone, and so is the rollback workflow (a CI key cannot roll
  back; an admin does it in the Foliwake admin or with `foliwake release rollback`).

### Patch Changes

- @foliwake/block-kit@0.8.0
  - @foliwake/site-check@0.8.0

## 0.7.0

### Patch Changes

- 214dd98: The `foliwake.config.json` of a new project names its content folder as a `local-markdown` source, the engine's
  current format: the engine refuses the old `contentRoot` key, so `foliwake dev` and `page check` failed in a new
  project with `SITE_CONFIG_INVALID`.
- @foliwake/block-kit@0.7.0
  - @foliwake/site-check@0.7.0

## 0.6.0

### Patch Changes

- @foliwake/block-kit@0.6.0
  - @foliwake/site-check@0.6.0

## 0.5.0

### Patch Changes

- fa06260: The `homepage` of every package is its page on the public SDK documentation site,
  `https://sdk.foliwake.dev/reference/packages/<name>`. No API change.
- Updated dependencies [7a50995]
- Updated dependencies [fa06260]
- Updated dependencies [702085e]
- Updated dependencies [405f967]
  - @foliwake/block-kit@0.5.0
  - @foliwake/site-check@0.5.0

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
- Updated dependencies [2b0bb9f]
- Updated dependencies [1cc3743]
- Updated dependencies [70af3e5]
  - @foliwake/block-kit@0.4.0
  - @foliwake/site-check@0.4.0

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
