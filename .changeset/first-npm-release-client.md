---
"@foliwake/client": minor
---

First release on npm, together with the new `@foliwake/site-check` and `create-foliwake` (one shared
version). The changes since the first 0.1.0 tarballs:

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
