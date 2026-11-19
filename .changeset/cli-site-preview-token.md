---
'@foliwake/cli': minor
'@foliwake/core-contract': minor
---

`foliwake site preview-token --site <id>` shows a site's preview token (HTTP Basic user `preview`) for an app that
reads preview, as `FOLIWAKE_PREVIEW_TOKEN`. The server answers only site admins and writes an audit entry for every
answer, without the value (core `sites.previewToken`, in the contract synced from the engine). A server without
the operation says so.
