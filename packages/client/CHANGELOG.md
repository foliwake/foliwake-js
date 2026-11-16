# Changelog: @foliwake/client

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/site-check`, `@foliwake/client`,
`@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version and are released
together; each changelog lists the changes of its own package. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

0.1.0 was packed for review only (GitHub Packages setup, never published on npm). 0.2.0 was prepared but not
published; 0.3.0 is the first release on npm, and its entries list the changes since the first 0.1.0 tarballs
(2026-11-11).

## 0.3.0 (unreleased)

- Released together with the new `@foliwake/site-check` and `create-foliwake`, which share this version.

First release. The package did not exist when the first 0.1.0 tarballs were packed; it was split out of
`@foliwake/react` afterwards (its in-repository 0.1.0 was never published).

- The framework-free browser client: `mountFoliwakePage` (body, host, block events, abort guards, block CSS,
  `update()`/`dispose()`), `createHost`, `subscribeBlockEvents`, `listenBlockEvents`, `cssMounts`, hooks.
  No framework dependency; `@foliwake/react` is a thin wrapper of it.
- Block events are delivered only when the app lists them: the core events `ready` and `error` always, any
  other type (such as `answer` from the assessment extension) only when named in `events`.
  `BLOCK_EVENT_TYPES` is `['ready', 'error']`. Changing `events` through `update()` re-subscribes.
- `createHost` reads extension members at call time (never after dispose) and returns `CreatedHost<Ext>`
  (extension members optional); `host.react` is forwarded when the app gives it.
- The mount inserts the page's scoped import map (module `foliwake`); option `nonce` for a CSP nonce.
- Built without source maps.
