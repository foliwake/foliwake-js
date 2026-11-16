# Changelog: @foliwake/react

The five app packages (`@foliwake/blocks-contract`, `@foliwake/client`, `@foliwake/server`, `@foliwake/react`,
`@foliwake/next`) share one version and are released together; each changelog lists the changes of its own
package. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

0.1.0 was packed for review only (GitHub Packages setup, never published on npm). 0.2.0 is the first release on
npm; its entries list the changes since the first 0.1.0 tarballs (2026-11-11).

## 0.2.0 (unreleased)

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
