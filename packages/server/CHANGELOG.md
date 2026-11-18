# Changelog: @foliwake/server

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/block-kit`, `@foliwake/site-check`,
`@foliwake/client`, `@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version
and are released together; each changelog lists the changes of its own package. While the version is 0.x, a
minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

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

- 1cc3743: Documentation: the READMEs name the kit's specifier `@foliwake/block-kit` everywhere, link to sibling
  packages instead of guides that are not public, and say which features need the Foliwake CLI, which is not
  public yet. The `@foliwake/next` README shows how to write the cached read yourself. The starters' loader comment names HTML contract 2. No API change.
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
- b0c16ac: First release on npm, together with the new `@foliwake/site-check` and `create-foliwake` (one shared
  version). The changes since the first 0.1.0 tarballs:
  
  - **BREAKING** The default blocks contract is `foliwake-blocks/2`.
  - **BREAKING** `preparePage` `mode` is the site's own token (`[a-z][a-z0-9-]`, at most 32 characters), none
    by default (0.1.0: `practice` by default, only `practice`/`review`); `exam` is still refused; `page.mode` is
    `string | null`.
  - **BREAKING** `foliwakeCsp`: `mediaBase` must be an `https://` address without credentials or wildcards
    (`TypeError` otherwise); only its origin is added to `img-src`. It may also name the site's image CDN.
  - **BREAKING** Page paths follow the engine's exact grammar: a segment is `[a-z0-9]+([-_][a-z0-9]+)*`.
    `_` inside a segment is now allowed (`/a_b`); `/a--b`, `/a-`, `/a__b` are refused before any request.
    The same grammar applies to `app.pages` globs.
  - Added: `live.auth.type: "service-token"` (and for `preview`) in `foliwake.remote.json` v2 (`issuer`, `kid`,
    `privateKeyEnv`): `createOriginClient` signs a fresh ES256 JWT for every request (`aud: site:<site>`,
    `exp = iat + 60`, `path`). New dependency `jose` 6.2.15; `schemas/remote-2.schema.json` extended
    (still version 2).
  - Added: SVG media (inline reference images): `.svg` media keys pass `mediaHandler`, are served as
    `image/svg+xml` with the code-SVG sandbox CSP and are never sent to the image transform.
  - Added: the page's import map (from `@foliwake/blocks-contract/import-map`; the server's own copy removed);
    preload hints resolve the `foliwake` module and hint modules as `preload as=script`.
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
