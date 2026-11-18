# Changelog: @foliwake/next

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/block-kit`, `@foliwake/site-check`,
`@foliwake/client`, `@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version
and are released together; each changelog lists the changes of its own package. While the version is 0.x, a
minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.9.0

### Minor Changes

- 003f643: Apps can be told when the live site changes. `@foliwake/server/hook` verifies the signed hook a Foliwake server
  sends once a change is live and the caches in front of the origin serve it (`verifyFoliwakeSignature`,
  `parseFoliwakeHook`, `signFoliwakeHook` for tests, payload types). `@foliwake/next/revalidate` adds
  `foliwakeRevalidateHandler({ secretEnv })`, a route handler that expires the live tag of every changed path, or
  of the whole site when every page changed, with `{ expire: 0 }` by default (`mode: 'max'` for background
  refresh), reads up to 20 changed pages again after answering (`warm`), accepts a previous secret while it is
  rotated (`previousSecretEnv`) and calls `onDelivery(payload)`.
- 6dd1fd4: **BREAKING** `PageEnvelope.generation` is now a number (`X-Site-Generation`, the live generation, which only
  grows), or null when the origin sends none; it was a string. An origin that sends a value that is not a
  non-negative integer is refused (`FoliwakePageError` kind `invalid`). Code that compared or stored the string
  needs updating.
  
  `@foliwake/next/cache` adds `setGenerationFloor((site) => Promise<number | null>)`: the app's highest known live
  generation (for example written by the hook's `onDelivery`). A cached live read whose generation is below the
  floor no longer stays for `app.revalidate` seconds: it lives at most 15 seconds and is read again, and the old
  page is shown meanwhile instead of an error. A floor that cannot be read turns the check off for that read and
  logs; without a floor nothing changes.

### Patch Changes

- Updated dependencies [003f643]
- Updated dependencies [6dd1fd4]
  - @foliwake/server@0.9.0
  - @foliwake/blocks-contract@0.9.0
  - @foliwake/react@0.9.0

## 0.8.0

### Patch Changes

- @foliwake/blocks-contract@0.8.0
  - @foliwake/react@0.8.0
  - @foliwake/server@0.8.0

## 0.7.0

### Patch Changes

- @foliwake/blocks-contract@0.7.0
  - @foliwake/react@0.7.0
  - @foliwake/server@0.7.0

## 0.6.0

### Patch Changes

- @foliwake/blocks-contract@0.6.0
  - @foliwake/react@0.6.0
  - @foliwake/server@0.6.0

## 0.5.0

### Patch Changes

- fa06260: The `homepage` of every package is its page on the public SDK documentation site,
  `https://sdk.foliwake.dev/reference/packages/<name>`. No API change.
- Updated dependencies [fa06260]
  - @foliwake/blocks-contract@0.5.0
  - @foliwake/react@0.5.0
  - @foliwake/server@0.5.0

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
  - @foliwake/react@0.4.0
  - @foliwake/server@0.4.0

## 0.3.0

### Minor Changes

- b0c16ac: First release on npm, together with the new `@foliwake/site-check` and `create-foliwake` (one shared
  version). The changes since the first 0.1.0 tarballs:
  
  - **BREAKING** Through `@foliwake/react`: block events are delivered only when listed in the `events` prop
    (core `ready`/`error` always); contract `foliwake-blocks/2`; assessment types come from
    `@foliwake/blocks-contract/assessment`.
  - **BREAKING** Through `@foliwake/server`: page `mode` is a site token (none by default), the stricter page path
    grammar, `https` media base for the CSP.
  - Added: `<FoliwakeImportMap>` and a `nonce` prop on `<FoliwakeServerPage>`; the server renders the page's
    import map and hints block modules as `preload as=script`.
  - Added (via `@foliwake/server`): `service-token` origin auth in `foliwake.remote.json`; `.svg` media through
    `mediaRoute` with the sandbox CSP.
  - Fixed: imports `next/cache.js`, `next/navigation.js` and `next/server.js` fully specified, so apps that
    import `@foliwake/next` under Node ESM (vitest) resolve them (`next` 16.2 has no `exports` map).
  - Built without source maps.

### Patch Changes

- Updated dependencies
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
- Updated dependencies [b0c16ac]
  - @foliwake/blocks-contract@0.3.0
  - @foliwake/server@0.3.0
  - @foliwake/react@0.3.0

## 0.2.0 and earlier (never published on npm)

0.1.0 was packed for review only (GitHub Packages setup); 0.2.0 was prepared but not published. The first
release on npm lists the changes since the first 0.1.0 tarballs (2026-11-11).
