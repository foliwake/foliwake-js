# @foliwake/core-contract

## 0.10.1

No changes in this release.

## 0.10.0

### Minor Changes

- ea82b05: `foliwake site preview-token --site <id>` shows a site's preview token (HTTP Basic user `preview`) for an app that
  reads preview, as `FOLIWAKE_PREVIEW_TOKEN`. The server answers only site admins and writes an audit entry for every
  answer, without the value (core `sites.previewToken`, in the contract synced from the engine). A server without
  the operation says so.

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

## 0.8.0

### Patch Changes

- 3edc810: The contract knows the engine's `SITE_HAS_NO_STORAGE` (category `refused`): a local project entry without storage
  was asked for work on a bucket (preview, publication, code release); such work runs on a server.

## 0.7.0

No changes in this release.

## 0.6.0

### Minor Changes

- 0d3a8d0: New package: the contract of Foliwake core over HTTP (`/api/rpc`), generated from the engine's router. Every
  procedure with its kind (`PROCEDURES`, `procedureType()`), the input and output types of each (`CoreProcedures`,
  `CoreInput`, `CoreOutput`, `CoreCaller`), the error categories and known codes (`ERROR_CATEGORIES`,
  `ERROR_CODES`, `CoreError`), and the API version and contract digest (`CORE_API`, `CONTRACT_DIGEST`) that a
  server's `GET /api/version` answers.
