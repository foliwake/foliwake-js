---
'create-foliwake': patch
---

The `foliwake.config.json` of a new project names its content folder as a `local-markdown` source, the engine's
current format: the engine refuses the old `contentRoot` key, so `foliwake dev` and `page check` failed in a new
project with `SITE_CONFIG_INVALID`.
