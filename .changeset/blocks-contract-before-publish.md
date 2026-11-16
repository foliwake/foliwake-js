---
"@foliwake/blocks-contract": minor
"@foliwake/block-kit": minor
"@foliwake/client": minor
"@foliwake/server": minor
"@foliwake/site-check": minor
"create-foliwake": minor
---

The kit's specifier is `@foliwake/block-kit`, the npm name of the kit (`KIT_SPECIFIER`); the import map of a code
release maps it and, for one more minor version, the previous `foliwake` (`LEGACY_KIT_SPECIFIER`, deprecated) to
the release's kit. `@foliwake/client` adds that map, `@foliwake/server` follows both specifiers in preload hints,
`@foliwake/site-check` accepts both in the reference scan, and the starters of `create-foliwake` import
`@foliwake/block-kit`.

A block may declare the major of the blocks contract it speaks: `BlockInit` has an optional `contract`, the block
kit's `defineBlock` sets `init.contract = 2`, and the starters' loader refuses another major
(`LOADER_BLOCK_CONTRACT`); a block that declares none is accepted. The loader always passes `host` (required in
the contract's `BlockInit`); the kit's init takes `host?` with the browser's fallbacks.

The kit's types of `ctx.mount` are `ViewAdapter`, `ViewHandle` and `ViewOptions`, so the contract's `MountHandle`
is re-exported under its own name. Reserved (not implemented): `shell: 'web-component'` (`KnownShell`), the
context key `'foliwake:host'`, and the loader's attributes as values (`@foliwake/blocks-contract/reserved`:
`BLOCK_ATTRIBUTES`, `KNOWN_SHELLS`, `HOST_CONTEXT_KEY`).
