---
"@foliwake/block-kit": minor
---

`dist/block-kit.js`, the kit the engine copies into every code release (`_foliwake/block-kit.js`), is now minified:
7,985 → 3,373 bytes gzip (24,956 → 7,725 raw; brotli 6,829 → 3,022). A page that renders a block downloads the kit
and `lit-html.js` together: 11,189 → 6,577 bytes gzip. The exports, the behaviour and the dynamic import of
`./lit-html.js` (next to the kit) are unchanged; the browser tests run against the minified file.

The readable module is kept as `dist/block-kit.debug.js` (new entry `@foliwake/block-kit/block-kit.debug.js`), for
reading and debugging: map `@foliwake/block-kit` to it in a local import map. It is not part of a code release. No
source map is shipped.
