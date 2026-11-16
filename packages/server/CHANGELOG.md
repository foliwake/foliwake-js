# Changelog: @foliwake/server

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/site-check`, `@foliwake/client`,
`@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version and are released
together; each changelog lists the changes of its own package. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

0.1.0 was packed for review only (GitHub Packages setup, never published on npm). 0.2.0 was prepared but not
published; 0.3.0 is the first release on npm, and its entries list the changes since the first 0.1.0 tarballs
(2026-11-11).

## 0.3.0 (unreleased)

- Released together with the new `@foliwake/site-check` and `create-foliwake`, which share this version.

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
