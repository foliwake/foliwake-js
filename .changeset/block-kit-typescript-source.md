---
"@foliwake/block-kit": patch
---

The block kit's source is TypeScript (`src/block-kit.ts`): `dist/block-kit.js` is compiled from it (still one
readable module importing only `./lit-html.js`), and the kit's declarations (`index.d.ts`, the standalone
`foliwake.d.ts`) are generated from the same source instead of written by hand. Same API, same behaviour; the
declarations add `lit-html.d.ts` and `block-kit.d.ts` next to the browser files.
