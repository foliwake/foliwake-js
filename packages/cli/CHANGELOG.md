# @foliwake/cli

## 0.10.0

### Minor Changes

- ea82b05: `foliwake site preview-token --site <id>` shows a site's preview token (HTTP Basic user `preview`) for an app that
  reads preview, as `FOLIWAKE_PREVIEW_TOKEN`. The server answers only site admins and writes an audit entry for every
  answer, without the value (core `sites.previewToken`, in the contract synced from the engine). A server without
  the operation says so.
- d53aa34: `npx @foliwake/next init` (bin `foliwake-next`, no extra dependencies) sets up a Next app: checks the site
  (discovery, `X-Code-Release` on `/index.plain.html`), writes `FOLIWAKE_URL` to `.env.local`, wraps `next.config` in
  `withFoliwake()` (two ES module forms; otherwise it prints the steps), and adds `app/foliwake/[...path]/route.ts`
  and `app/[...path]/page.tsx`. `--preview` adds a preview route behind a development-only `isAuthor()` and an empty
  `FOLIWAKE_PREVIEW_TOKEN=`; `--hook`, `--mount /pages`, `--dry-run`, `--json`, `--force` (only files it generated),
  `--yes` (or `CI=1`; needs `--url`), `--ignore-git-changes`, and `--check` to check an existing setup. Exit codes 0,
  1 (error) and 2 (input needed); env equivalents `FOLIWAKE_INIT_*`. It never writes or prints a secret value.
  `foliwake next init` in `@foliwake/cli` runs the same wizard.

### Patch Changes

- 886f4b4: The command reference in the README escapes `<…>` in flag descriptions, so they show on npm and on the documentation site.
- Updated dependencies [339fb47]
- Updated dependencies [ea82b05]
- Updated dependencies [69caab7]
- Updated dependencies [df85d39]
- Updated dependencies [0bb04d6]
  - @foliwake/blocks-contract@0.10.0
  - @foliwake/server@0.10.0
  - @foliwake/site-check@0.10.0
  - @foliwake/core-contract@0.10.0
  - @foliwake/block-kit@0.10.0
  - create-foliwake@0.10.0

## 0.9.0

### Minor Changes

- 0cfb15c: Organisations and site deletion: `foliwake org list`, `foliwake org create <id> [--name]` (the installation's owner;
  core `org.create`) and `foliwake site delete --site <id> [--confirm <id>] [--force]` (core `sites.delete`: refused
  while the site works, has live pages or is named by memberships, invitations or CI keys; its bucket is kept and the
  command says how to go on).
  
  `site create`, `connect --create` and `create --create-site` never leave the organisation to the server: `--org`, or
  the only organisation where the account may create sites (said), or asked in a terminal when there are several
  (refused without one, listing them). `connect --create` gets `--org` and `--repository`; the repository defaults to
  the folder's Git `origin` as an https:// address (`--repository none`: none). The "Next steps" after a new site no
  longer mention SSH secrets: a public repository needs no code token, a private one a read token; the workflows take
  a CI key made with `account keys create --site <id> --label github-actions`.
  
  The core contract adds `org.create` and `sites.delete` and their error codes.
- 69dee17: `source add`: `--list-title` (Drupal, per `--language`), `--plugin google-docs` with `--page <document link or
  ID>=<path>` (repeatable) and an optional `--folder`, and `--allow-private-host <host>` (the source's
  `operator.allowPrivateHosts`; the installation's owner only). A source whose connection check fails is no longer
  saved unless `--force`. When another source owns the whole site (`/`), it prints how to narrow that one first.
  `source check` checks a new source described with the same flags (`--id …`) without saving it.

### Patch Changes

- c8e7363: With the engine, `page check --content <dir>` (and every command with `--content`) in a folder linked to a site
  checks the local files with the folder's `foliwake.config.json` instead of refusing: `--content` names a folder on
  this computer, so it chooses the local runtime before the folder's link. `--server` with `--content` is still
  refused.
- Updated dependencies [003f643]
- Updated dependencies [0cfb15c]
- Updated dependencies [5a7ffdf]
- Updated dependencies [6dd1fd4]
  - @foliwake/server@0.9.0
  - @foliwake/core-contract@0.9.0
  - create-foliwake@0.9.0
  - @foliwake/blocks-contract@0.9.0
  - @foliwake/block-kit@0.9.0
  - @foliwake/site-check@0.9.0

## 0.8.0

### Patch Changes

- 8f83657: With the engine registered, an explicit `FOLIWAKE_SERVER` now wins over `FOLIWAKE_CONFIG`: a command goes to
  `--server`, then `--config`, then `FOLIWAKE_CONFIG` only while `FOLIWAKE_SERVER` is unset, then the folder's
  `.foliwake/connection.json`, `FOLIWAKE_SERVER`, `./foliwake.config.json`, the last `login`, else locally. The
  engine's Docker image sets `FOLIWAKE_CONFIG` for its own commands; a CI job or operator naming a server in the
  container now reaches it without clearing that variable.
- Updated dependencies [3edc810]
- Updated dependencies [7e70573]
  - @foliwake/core-contract@0.8.0
  - create-foliwake@0.8.0
  - @foliwake/block-kit@0.8.0
  - @foliwake/blocks-contract@0.8.0
  - @foliwake/server@0.8.0
  - @foliwake/site-check@0.8.0

## 0.7.0

### Minor Changes

- 3195ef3: `@foliwake/cli/local-runtime`: `registerLocalRuntime()`, the hook the Foliwake engine uses to run this package's
  commands on its own computer as an oclif plugin (`--config`, `--content`, `FOLIWAKE_CONFIG`,
  `./foliwake.config.json` in the engine's server order, `dev` served by the engine, `operation recover --break-lock`,
  phase timings and traces). `chooseTarget()` is exported for it. Without the engine nothing changes, except that
  `dev --remote --content|--config|--site` now says those flags do not apply with `--remote` (as the engine's `dev`
  does) instead of "Nonexistent flag".

### Patch Changes

- Updated dependencies [214dd98]
  - create-foliwake@0.7.0
  - @foliwake/block-kit@0.7.0
  - @foliwake/blocks-contract@0.7.0
  - @foliwake/core-contract@0.7.0
  - @foliwake/server@0.7.0
  - @foliwake/site-check@0.7.0

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
