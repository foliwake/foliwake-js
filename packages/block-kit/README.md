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
| `@foliwake/block-kit/block-kit.js`, `/lit-html.js`, `/lit-html.LICENSE` | the browser files of a code release's `_foliwake/` (lit-html 3.3.3, BSD-3-Clause) |
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

The guide: [Write a block](https://docs.foliwake.dev/guide/write-a-block).
