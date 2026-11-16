# Changelog: @foliwake/blocks-contract

The packages of this repository (`@foliwake/blocks-contract`, `@foliwake/site-check`, `@foliwake/client`,
`@foliwake/server`, `@foliwake/react`, `@foliwake/next`, `create-foliwake`) share one version and are released
together; each changelog lists the changes of its own package. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

0.1.0 was packed for review only (GitHub Packages setup, never published on npm). 0.2.0 was prepared but not
published; 0.3.0 is the first release on npm, and its entries list the changes since the first 0.1.0 tarballs
(2026-11-11).

## 0.3.0 (unreleased)

- Released together with the new `@foliwake/site-check` and `create-foliwake`, which share this version.

- **BREAKING** The contract is `foliwake-blocks/2` (was `/1`): `ContractVersion.major` is `2` and
  `package.json` carries `"foliwake": { "blocksContract": 2 }`. The core is project-agnostic: `HostCore`,
  `BlockHost<Ext>` for host extensions, `BlockEvents<Ext>`, `FoliwakeEvent<Events, T>`; the core events are
  only `ready` and `error`.
- **BREAKING** The assessment types moved to the subpath `@foliwake/blocks-contract/assessment`: `Answer`,
  `SavedAnswer`, `Verdict`, `AssessmentMode`, `AssessmentHostMembers` (`mode`, `policy`, `saved`,
  `check`), `AssessmentHost` and `AssessmentEvents` (`select`, `check`, `answer`, `reset`,
  `complete`). They are no longer exported from the root.
- **BREAKING** `host.mode` is the site's own token (`string`, optional); page data carries `mode: string | null`.
- Added: `BlockMeta` (block name and `ui` labels) as the optional third argument of `BlockInit`; optional
  `host.react` (`HostReact`).
- Added: `@foliwake/blocks-contract/import-map` with `pageImportMap`, the import map of a code release (module
  `foliwake` → the release's block kit); the package's only runtime code, browser-safe, shared by
  `@foliwake/client` and `@foliwake/server`.
- The modules are built without source maps and carry no `sourceMappingURL`.
- Published on npm (`publishConfig.access: public`, provenance); the GitHub Packages registry is no longer used.
