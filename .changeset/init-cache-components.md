---
'@foliwake/next': patch
---

`npx @foliwake/next init` turns on `cacheComponents: true` in `next.config.(ts|mjs|js)` for the same forms it
wraps in `withFoliwake` (`export default { … }` and `export default <name>` of a `const` object literal, wrapped or
not), including the file `create-next-app` writes. A second run changes nothing; `--dry-run` and `--json` report it
as its own step. Any other form (a config built elsewhere, `cacheComponents: false`) is left alone and the line to
add, `cacheComponents: true,`, is printed.
