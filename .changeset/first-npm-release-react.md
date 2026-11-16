---
"@foliwake/react": minor
---

First release on npm, together with the new `@foliwake/site-check` and `create-foliwake` (one shared
version). The changes since the first 0.1.0 tarballs:

- **BREAKING** Block events reach `<FoliwakePage onEvent>` and `useFoliwakeEvents` only when the host lists
  them: the core events `ready` and `error` always, any other type only when named in the `events` prop
  (for example `events={['answer'] as const}`). 0.1.0 delivered all seven event types. `BLOCK_EVENT_TYPES` is
  now `['ready', 'error']`. `<FoliwakePage>` and `useFoliwakeEvents` are generic over the event map.
- **BREAKING** `Answer`, `SavedAnswer` and `Verdict` are no longer re-exported; import them from
  `@foliwake/blocks-contract/assessment`. Contract `foliwake-blocks/2` (see `@foliwake/blocks-contract`).
- **BREAKING** The package is a thin wrapper of the new `@foliwake/client` (a new dependency), which now holds
  the mount lifecycle; `listenBlockEvents`, `BLOCK_EVENT_TYPES`, `HOST_CONTRACT_MINOR` and `cssMounts` are
  re-exported from it.
- Added: `nonce` prop (CSP nonce of the page's import map); types `CreatedHost`, `FoliwakeHooks`,
  `BlockEvents`, `HostCore`, `MountReport`, `MountStatus` re-exported.
- Built without source maps.
