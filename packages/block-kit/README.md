# @foliwake/block-kit

<!-- usage -->

The block kit of Foliwake site blocks: the module `@foliwake/block-kit` a block imports.

```js
// components/note/note.js
import { defineBlock, html } from '@foliwake/block-kit';

export default defineBlock('note', (fields, ctx) => {
  const open = ctx.state(false);
  ctx.render(() => html`<button @click=${() => (open.value = !open.value)}>${ctx.t('more')}</button>`);
});
```

In a page, `@foliwake/block-kit` is mapped to the kit of the page's own code release (`_foliwake/block-kit.js`): the
Foliwake engine adds this package's browser files to every code release, so a site needs no build step and no
npm dependency to use it. Install the package for its types, or to serve the files yourself:

```sh
npm install -D @foliwake/block-kit
```

```ts
import { defineBlock, html, readFields, type BlockHost, type BlockInit } from '@foliwake/block-kit';
import type { AssessmentHost } from '@foliwake/block-kit/assessment';
```

| Entry | What |
| --- | --- |
| `@foliwake/block-kit` | `defineBlock`, `html`, `nothing`, `readFields`, `version`, `CONTRACT`; the kit's types (`BlockContext`, `ViewAdapter`/`ViewHandle` of `ctx.mount`, …) and the blocks contract's (`BlockHost`, `BlockEvents`, `MountHandle`, …; the contract's `BlockInit` as `ContractBlockInit`) |
| `@foliwake/block-kit/assessment` | the types of the assessment extension of the blocks contract |
| `@foliwake/block-kit/block-kit.js`, `/lit-html.js`, `/lit-html.LICENSE` | the browser files of a code release's `_foliwake/` (lit-html 3.3.3, BSD-3-Clause); `block-kit.js` is minified |
| `@foliwake/block-kit/block-kit.debug.js` | the same kit as one readable module, for reading and debugging; not part of a code release |
| `@foliwake/block-kit/foliwake.d.ts` | the kit's types as one standalone file, for `.foliwake/types/foliwake.d.ts` of a site folder (jsconfig `paths`) |

`defineBlock` returns the block's `init` with `init.block` (its name) and `init.contract` (`2`, the major of the
blocks contract): a loader refuses a block of another major. The loader always passes the page's host; called
without one (an editor, a test), a block falls back to the browser: its key from `data-block-key`, its labels
from its own `ui`.

After a setup that did not send `ready`, the kit sends `<prefix>:ready` (`{ key, block, contract: 2 }`).
A block that decides itself when it is ready opts out with `autoReady: false`:

```js
export default defineBlock('quiz', (fields, ctx) => {
  if (!knownForm(fields)) return; // no ready: the root stays unready
  ctx.render(() => html`…`);
  ctx.emit('ready', { required: true, restored: false });
}, { prefix: 'quiz', autoReady: false });
```

With `autoReady: false` a root gets `ready` only when the block sends it; the default is `true`.

## When lit-html loads

`html` and `nothing` are lit-html's values, made by the kit itself: writing a template needs no lit-html.
The kit imports `lit-html.js` (next to `block-kit.js`) the first time a block on the page renders a view:
`ctx.render`, or a view returned to `ctx.list`. A page whose blocks never render one does not download it.

While it loads, on the first render of a page:

- the view function runs at once, so a view that throws still fails the setup;
- the view paints once lit-html has loaded, with the latest state (changes meanwhile are not lost);
- `init` returns at once for a synchronous setup, as before; `ready` (the kit's, or the block's own
  `ctx.emit('ready')`) is sent once the block's views are on the page;
- a block disposed meanwhile paints nothing and sends nothing.

Read the rendered elements after `ready` (or in an event handler), not right after `ctx.render` in the setup.
Once lit-html has loaded, every render paints at once.

If `lit-html.js` cannot be loaded, or a first paint throws, the block sends `error` with
`{ code: 'BLOCK_MOUNT_FAILED', message, recoverable: true }`: its authored HTML stays, and `ready` is still sent.
The next render on the page tries the load again.

## `ctx.state`

`ctx.state(initial)` returns `{ value }`. Replacing `value` re-renders every view and effect of the block, once per
microtask however many changes. Setting a value equal to the current one (`Object.is`) does nothing, and so does
any change after the block was disposed. Replace values, do not mutate them: `list.value = [...list.value, item]`.

## `ctx.mount`: a view of another framework

`ctx.mount(view, props, options?)` mounts a component of React, Preact, Vue, … into the block. The view is the
site's small adapter: `view.render(element, props, { fail })` and `view.unmount(element)`. The kit makes the
element (`<div data-island>`) and calls `render` again on every `update`.

| Option | What |
| --- | --- |
| `replace` | hide the authored children while the view shows; they come back on failure and on dispose |
| `into` | a field name or an element of the block to mount in (default: the root, after its children) |
| `onReady(handle)` | called once the first render returned or its promise resolved |
| `onError(error)` | called when a render fails |

It returns `{ element, update(props), dispose(), fail(error) }`, and is disposed with the block.

A failing render rolls back: one that throws, rejects, or calls `fail` later. The element goes, the authored HTML
is shown again, `onError` is called and the block sends `error` with
`{ code: 'BLOCK_MOUNT_FAILED', message, recoverable: true }`. After a failure or a dispose, `update` and `fail` do
nothing. `unmount` runs exactly once, after any render still in progress has settled.

`create-foliwake --react` writes such an adapter for React, `scripts/react-view.js`. It passes `fail` to React 19's
`onUncaughtError`, so a render error after the first commit also rolls the block back.

A new site with a working block: [`create-foliwake`](https://www.npmjs.com/package/create-foliwake). The checks
a block must pass: [`@foliwake/site-check`](https://www.npmjs.com/package/@foliwake/site-check).
