---
"@foliwake/block-kit": minor
---

`@foliwake/block-kit` loads the vendored `lit-html.js` only when a block renders a view (`ctx.render`, or a view
returned to `ctx.list`), with a dynamic `import()` next to the kit. A page whose blocks never render one no longer
downloads lit-html. Not breaking: the API and its types are unchanged; `html` stays synchronous and returns
lit-html's template result, and `nothing` is lit-html's.

What changes on the first render of a page, while `lit-html.js` loads:

- the view function runs at once (a view that throws still fails the setup), and the view paints once lit-html
  has loaded, with the latest state; after that, every render paints at once, as before;
- `init` still returns at once for a synchronous setup; `ready` (the kit's or the block's own) is sent once the
  block's views are on the page;
- a block disposed meanwhile paints nothing;
- a failed load, or a first paint that throws, sends the block's `error` with `BLOCK_MOUNT_FAILED`
  (`recoverable: true`): the authored HTML stays, and `ready` is still sent. A later render tries the load again.

`dist/block-kit.js` stays one module; its only import is now the dynamic one of `./lit-html.js`, so the preload
hints of `@foliwake/server` no longer list `lit-html.js`.
