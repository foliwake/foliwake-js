# @foliwake/core-contract

## 0.7.0

No changes in this release.

## 0.6.0

### Minor Changes

- 0d3a8d0: New package: the contract of Foliwake core over HTTP (`/api/rpc`), generated from the engine's router. Every
  procedure with its kind (`PROCEDURES`, `procedureType()`), the input and output types of each (`CoreProcedures`,
  `CoreInput`, `CoreOutput`, `CoreCaller`), the error categories and known codes (`ERROR_CATEGORIES`,
  `ERROR_CODES`, `CoreError`), and the API version and contract digest (`CORE_API`, `CONTRACT_DIGEST`) that a
  server's `GET /api/version` answers.
