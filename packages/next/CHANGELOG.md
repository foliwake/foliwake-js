# Changelog: @foliwake/next

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/block-kit`, `@foliwake/site-check`,
`@foliwake/client`, `@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version
and are released together; each changelog lists the changes of its own package. While the version is 0.x, a
minor release may break; breaking changes are marked **BREAKING**.

Entries are written from the changesets of each pull request (`.changeset/`, CONTRIBUTING.md), newest first.

## 0.10.1

### Patch Changes

- 44822ad: The hook trims leading and trailing whitespace and newlines from the secret read from `secretEnv` and
  `previousSecretEnv` (a secret pasted with a trailing newline used to fail every signature), warns once naming the
  variable (never the value), and treats an all-whitespace value as unset. New: `hookSecretsFrom` in
  `@foliwake/server/hook-endpoint`. The docs make the secret with `openssl rand -hex 32 | tr -d '\n'`.
- e81a756: `npx @foliwake/next init` turns on `cacheComponents: true` in `next.config.(ts|mjs|js)` for the same forms it
  wraps in `withFoliwake` (`export default { … }` and `export default <name>` of a `const` object literal, wrapped or
  not), including the file `create-next-app` writes. A second run changes nothing; `--dry-run` and `--json` report it
  as its own step. Any other form (a config built elsewhere, `cacheComponents: false`) is left alone and the line to
  add, `cacheComponents: true,`, is printed.
- Updated dependencies [44822ad]
  - @foliwake/server@0.10.1
  - @foliwake/blocks-contract@0.10.1
  - @foliwake/react@0.10.1

## 0.10.0

### Minor Changes

- 69caab7: Configure an app by one address. `@foliwake/server/discovery` reads a site's `/.well-known/foliwake.json`
  (no redirects, 5 s, one retry, at most 16 KiB; `live.url` must be the origin it was read from; the discovery format
  and the plain contract are checked). `@foliwake/server/resolve` builds the app config from `FOLIWAKE_URL` and the
  optional `foliwake.remote.json` version 3 (overrides only: pages, revalidate, proxies, media, blocks, auth by
  variable name; schema `schemas/remote-3.schema.json`, also shipped in `@foliwake/next`). Defaults: pages `/**`
  (required explicitly when live uses a service token), proxies `/foliwake/code` and `/foliwake/media`, preview
  read with Basic `preview` and `FOLIWAKE_PREVIEW_TOKEN`. A version 2 file without `FOLIWAKE_URL` works unchanged.
  `FoliwakeAppConfig.version` is now `2 | 3` and `app.blocks` has `fromRelease`. The compatibility metadata is
  `remoteConfig: 3, discovery: 1`.
- d53aa34: `npx @foliwake/next init` (bin `foliwake-next`, no extra dependencies) sets up a Next app: checks the site
  (discovery, `X-Code-Release` on `/index.plain.html`), writes `FOLIWAKE_URL` to `.env.local`, wraps `next.config` in
  `withFoliwake()` (two ES module forms; otherwise it prints the steps), and adds `app/foliwake/[...path]/route.ts`
  and `app/[...path]/page.tsx`. `--preview` adds a preview route behind a development-only `isAuthor()` and an empty
  `FOLIWAKE_PREVIEW_TOKEN=`; `--hook`, `--mount /pages`, `--dry-run`, `--json`, `--force` (only files it generated),
  `--yes` (or `CI=1`; needs `--url`), `--ignore-git-changes`, and `--check` to check an existing setup. Exit codes 0,
  1 (error) and 2 (input needed); env equivalents `FOLIWAKE_INIT_*`. It never writes or prints a secret value.
  `foliwake next init` in `@foliwake/cli` runs the same wizard.
- 6b53207: `@foliwake/next/handler`: one route file, `app/foliwake/[...path]/route.ts` with
  `export { GET, HEAD, POST } from '@foliwake/next/handler'`, serves the code and media proxies, the hook (secret in
  `FOLIWAKE_HOOK_SECRET`, Next cache tags expired as by `foliwakeRevalidateHandler`) and `/foliwake/health`.
  Preview is off; `createFoliwakeHandler({ authorizePreview, hook, base })` customises it. It wraps
  `createFoliwakeHandler` of `@foliwake/server/handler`. `codeRoute`, `mediaRoute` and `foliwakeRevalidateHandler`
  stay for the manual setup.
- 676ecdb: `@foliwake/next/page`: a ready page route. `app/[...path]/page.tsx` with
  `export { default, generateMetadata } from '@foliwake/next/page'` shows live site pages at the app's root (the
  app's own routes win; `/` stays the app's): Suspense, the page read and prepared, preload hints and import map,
  `<FoliwakePage as="article">`, `notFound()` for a missing page. `generateMetadata` gives the title (the first `<h1>`)
  and `noindex` for preview. `createFoliwakePage({ render, prepare, channel, authorize, mount, fallback })`
  customises it; a preview route requires `authorize`.
- ebc65c2: `withFoliwake` reads `FOLIWAKE_URL`: when it is set, the site's discovery document is read as Next loads
  next.config (with the optional `foliwake.remote.json` version 3 merged), validated, and inlined as a snapshot for
  the server modules; the CSP `img-src` gets the site's media CDN. Nothing is fetched at run time. A failure fails the
  build with the address and the reason. In that case `withFoliwake` returns a promise of the config, which Next
  accepts (type `FoliwakeNextConfig = NextConfig | Promise<NextConfig>`; code that annotated the result as
  `NextConfig` needs the new type). Without `FOLIWAKE_URL` the version 2 file is read as before.
  `foliwakeCspHeader` takes an already read `config`. Without `withFoliwake`, `FOLIWAKE_URL` alone is refused at run
  time with a message that says to wrap next.config.

### Patch Changes

- eff516d: `@foliwake/next` ships the config schema as `schemas/remote-2.schema.json`, so `"$schema"` in
  `foliwake.remote.json` resolves when `@foliwake/next` is the only direct dependency (pnpm). The guide installs one
  package, its preview example uses the user name `preview` with the site's preview token, and it explains
  `app.proxies.pages: null`.
- df85d39: `@foliwake/server/handler`: `createFoliwakeHandler()` serves every Foliwake route of an app as one
  `(request: Request) => Promise<Response>` on the Web Fetch API, for any framework: the code and media proxies under
  the config's prefixes (`/foliwake/code`, `/foliwake/media` by default), `POST /foliwake/hook` (secret in
  `FOLIWAKE_HOOK_SECRET`, `onDelivery` for the app's caches) and `GET /foliwake/health`. Preview is off unless
  `authorizePreview` is given. The config is read on the first request (`FOLIWAKE_URL`), or passed as `config`.
  The hook endpoint core moved from `@foliwake/next` to `@foliwake/server/hook-endpoint` (`createHookEndpoint`);
  a ping of the Next route still answers `@foliwake/next/<version>`. New guide: "Any framework: one handler".
- Updated dependencies [339fb47]
- Updated dependencies [69caab7]
- Updated dependencies [df85d39]
  - @foliwake/blocks-contract@0.10.0
  - @foliwake/server@0.10.0
  - @foliwake/react@0.10.0

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
