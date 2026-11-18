---
'@foliwake/cli': patch
---

With the engine registered, an explicit `FOLIWAKE_SERVER` now wins over `FOLIWAKE_CONFIG`: a command goes to
`--server`, then `--config`, then `FOLIWAKE_CONFIG` only while `FOLIWAKE_SERVER` is unset, then the folder's
`.foliwake/connection.json`, `FOLIWAKE_SERVER`, `./foliwake.config.json`, the last `login`, else locally. The
engine's Docker image sets `FOLIWAKE_CONFIG` for its own commands; a CI job or operator naming a server in the
container now reaches it without clearing that variable.
