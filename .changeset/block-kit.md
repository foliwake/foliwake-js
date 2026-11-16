---
"@foliwake/block-kit": minor
---

New package: the block kit of the Foliwake engine (the module `foliwake` that site blocks import: `defineBlock`,
`html`, `nothing`), the legacy `block-kit-1.js` and the vendored lit-html 3.3.3, with the same behaviour, as the
browser files the engine adds to every code release. New: `readFields(root)` is exported. Types: the kit's
declarations (also standalone, `@foliwake/block-kit/foliwake.d.ts`, for site folders without node_modules) and the
blocks contract's types re-exported, including the assessment extension (`@foliwake/block-kit/assessment`); the
init `defineBlock` returns takes the contract's host (`HostMembers`), so it is a `ContractBlockInit` for any host
extension.
