---
'@foliwake/cli': patch
---

With the engine, `page check --content <dir>` (and every command with `--content`) in a folder linked to a site
checks the local files with the folder's `foliwake.config.json` instead of refusing: `--content` names a folder on
this computer, so it chooses the local runtime before the folder's link. `--server` with `--content` is still
refused.
