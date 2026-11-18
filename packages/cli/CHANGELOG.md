# @foliwake/cli

## 0.6.0

### Minor Changes

- a676091: `foliwake connect` links a project folder to a site in one step: a new site (as `site create`) or one you may
  develop (as `site link`), asked in a terminal or given with `--create <id>` / `--link <id>`; a linked folder is
  refused unless `--force`. The README carries a generated command reference (`pnpm cli:reference`).
- 796eb0d: `foliwake dev --remote [preview|live]` (and `--remote-url`) without the engine: the deployed site's pages with
  this checkout's `components/`, `scripts/` and `styles/`, the block kit from `@foliwake/block-kit`, `--watch`
  reloads with the checks of `@foliwake/site-check`. The block catalog (`/_dev/blocks`) answers that it needs the
  engine or the open block renderer.
- 243d817: New package: `foliwake` without the engine. `login`, `logout` and `whoami` against a Foliwake server, with the
  engine CLI's sign-ins (same keychain entries and `servers.json`), the server chosen by `--server`, the folder's
  `.foliwake/connection.json`, `FOLIWAKE_SERVER`, then the last login, and `FOLIWAKE_TOKEN` for CI keys.
- c8e05ad: The remote commands of `foliwake` without the engine: `site …`, `preview`/`publish` in a linked folder
  (`project …`), `source …`, `page …`, `code …`, `release rollback`, `migration …`, `branch …`, `operation …`,
  `credential …`, `account keys …`, and `create` (create-foliwake, then the site on your server). Texts and `--json`
  are the engine CLI's for the same answers; what needs a local configuration says it needs the engine.
- cf9750f: `foliwake servers` lists the servers this computer is signed in to and `foliwake servers use <server>` sets the
  default. A `login` to another server keeps the default unless `--default` is passed. `login` needs a server
  address (asked in a terminal); the reserved name `cloud` answers that Foliwake Cloud is not available yet.
- 5144ae1: New package `foliwake`: the short name of `@foliwake/cli` for `npx foliwake`; it runs `@foliwake/cli` of the
  same version and has no code of its own. `@foliwake/cli` exports its command entry as `@foliwake/cli/bin`.

### Patch Changes

- Updated dependencies [0d3a8d0]
  - @foliwake/core-contract@0.6.0
  - @foliwake/block-kit@0.6.0
  - @foliwake/blocks-contract@0.6.0
  - create-foliwake@0.6.0
  - @foliwake/server@0.6.0
  - @foliwake/site-check@0.6.0
