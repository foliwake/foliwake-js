---
"@foliwake/next": minor
---

First release on npm, together with the new `@foliwake/site-check` and `create-foliwake` (one shared
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
