# Changelog: @foliwake/block-kit

`@foliwake/block-kit` shares one version with the other packages of this repository and is released together
with them. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

## 0.3.0 (unreleased)

- First release. The block kit of the Foliwake engine (the module `foliwake` that site blocks import: `defineBlock`,
  `html`, `nothing`), the legacy `block-kit-1.js` and the vendored lit-html 3.3.3, with the same behaviour, as the
  browser files the engine adds to every code release (`@foliwake/block-kit/block-kit.js`, `…/lit-html.js`,
  `…/block-kit-1.js`).
- New: `readFields(root)` is exported (the fields `defineBlock` gives `setup`).
- Types: the kit's declarations (also standalone, `@foliwake/block-kit/foliwake.d.ts`, for site folders without
  node_modules) and the blocks contract's types re-exported, including the assessment extension
  (`@foliwake/block-kit/assessment`). The init `defineBlock` returns takes the contract's host (`HostMembers`),
  so it is a `ContractBlockInit` for any host extension.
