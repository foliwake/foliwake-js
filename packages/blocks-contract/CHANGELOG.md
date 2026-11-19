# Changelog: @foliwake/blocks-contract

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/block-kit`, `@foliwake/site-check`,
`@foliwake/client`, `@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version
and are released together; each changelog lists the changes of its own package. While the version is 0.x, a
minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.10.1

No changes in this release.

## 0.10.0

### Minor Changes

- 339fb47: A page's code release names its blocks module. `readEnvelope` reads `X-Foliwake-Blocks`
  (`entry="scripts/blocks.js", contract=2, prefix="demo"`) into `envelope.blocks`; with a version 3 config without
  `app.blocks`, `preparePage` mounts that entry with its contract and event prefix (`app.blocks` still wins, and a
  version 2 config is unchanged). Preload hints follow the page's entry. `FoliwakePageData.title` is the text of the
  body's first `<h1>`. `@foliwake/site-check` accepts and checks the optional `blocks` key of
  `components/components.json` with the engine's rule (an entry under scripts, components or _foliwake ending in .js
  that exists, a contract major, an event prefix).

## 0.9.0

### Minor Changes

- 6dd1fd4: **BREAKING** `PageEnvelope.generation` is now a number (`X-Site-Generation`, the live generation, which only
  grows), or null when the origin sends none; it was a string. An origin that sends a value that is not a
  non-negative integer is refused (`FoliwakePageError` kind `invalid`). Code that compared or stored the string
  needs updating.
  
  `@foliwake/next/cache` adds `setGenerationFloor((site) => Promise<number | null>)`: the app's highest known live
  generation (for example written by the hook's `onDelivery`). A cached live read whose generation is below the
  floor no longer stays for `app.revalidate` seconds: it lives at most 15 seconds and is read again, and the old
  page is shown meanwhile instead of an error. A floor that cannot be read turns the check off for that read and
  logs; without a floor nothing changes.

## 0.8.0

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

### Patch Changes

- fa06260: The `homepage` of every package is its page on the public SDK documentation site,
  `https://sdk.foliwake.dev/reference/packages/<name>`. No API change.

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
