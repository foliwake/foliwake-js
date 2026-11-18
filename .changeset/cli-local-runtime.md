---
'@foliwake/cli': minor
---

`@foliwake/cli/local-runtime`: `registerLocalRuntime()`, the hook the Foliwake engine uses to run this package's
commands on its own computer as an oclif plugin (`--config`, `--content`, `FOLIWAKE_CONFIG`,
`./foliwake.config.json` in the engine's server order, `dev` served by the engine, `operation recover --break-lock`,
phase timings and traces). `chooseTarget()` is exported for it. Without the engine nothing changes, except that
`dev --remote --content|--config|--site` now says those flags do not apply with `--remote` (as the engine's `dev`
does) instead of "Nonexistent flag".
