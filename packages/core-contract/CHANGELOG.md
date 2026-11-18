# @foliwake/core-contract

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
