---
'@foliwake/blocks-contract': minor
'@foliwake/server': minor
'@foliwake/site-check': minor
---

A page's code release names its blocks module. `readEnvelope` reads `X-Foliwake-Blocks`
(`entry="scripts/blocks.js", contract=2, prefix="demo"`) into `envelope.blocks`; with a version 3 config without
`app.blocks`, `preparePage` mounts that entry with its contract and event prefix (`app.blocks` still wins, and a
version 2 config is unchanged). Preload hints follow the page's entry. `FoliwakePageData.title` is the text of the
body's first `<h1>`. `@foliwake/site-check` accepts and checks the optional `blocks` key of
`components/components.json` with the engine's rule (an entry under scripts, components or _foliwake ending in .js
that exists, a contract major, an event prefix).
