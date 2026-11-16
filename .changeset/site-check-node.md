---
"@foliwake/site-check": minor
---

The checks of site code: block definitions (`blocks/pack`, `blocks/authoring-keys`, `blocks/extras`,
`blocks/editor-config`), the JSON Schema of a block definition (`blocks/schema`), block example files
(`blocks/examples`), reference tables (`references/tables`), link URLs (`urls`), the site code reader
(`site-code`), the descriptor check and the reference scan of scripts and stylesheets. `checkCodeRelease(files)`
and `checkSiteCode(dir)` return one sorted list of diagnostics with the captured and ignored files. New codes:
`CODE_FILE_REQUIRED`, `CODE_FILE_GENERATED`, `CODE_REFERENCE_NOT_RELATIVE`, `CODE_REFERENCE_OUTSIDE`,
`CODE_REFERENCE_MISSING`, `CODE_PATH_IGNORED` (info), `CODE_FOLDER_NAME_INVALID`, `CODE_FILE_TOO_LARGE` and
`CODE_RELEASE_TOO_LARGE` (warnings for now: 2 MiB per file, 30 MiB and 2000 files per release),
`QUERY_CONFIG_INVALID` and `ACCESS_CONFIG_INVALID` with a line, column and field.
