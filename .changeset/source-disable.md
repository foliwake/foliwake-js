---
'@foliwake/cli': minor
'@foliwake/core-contract': minor
---

`foliwake source disable --source <id>` and `foliwake source enable --source <id>` (core `sources.disable` /
`sources.enable`, optional `--expect <revision>`): a disabled source is not synced and is skipped by preview; preview
and publish keep its last accepted snapshot, its live pages and owned paths are kept. `source list` marks a disabled
source. The contract adds both procedures and the error codes `SOURCE_DISABLED`, `SYNC_SCOPE_INVALID` and
`SYNC_SCOPE_UNKNOWN_PAGE`.
