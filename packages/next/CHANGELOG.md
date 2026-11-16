# Changelog: @foliwake/next

The five app packages (`@foliwake/blocks-contract`, `@foliwake/client`, `@foliwake/server`, `@foliwake/react`,
`@foliwake/next`) share one version and are released together; each changelog lists the changes of its own
package. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

0.1.0 was packed for review only (GitHub Packages setup, never published on npm). 0.2.0 is the first release on
npm; its entries list the changes since the first 0.1.0 tarballs (2026-11-11).

## 0.2.0 (unreleased)

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
