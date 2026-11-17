# Write a block

A block is a folder `components/<name>/` in the site's code repository:

| File | Required | What |
| --- | --- | --- |
| `<name>.json` | yes | the definition: the block's fields, in order |
| `<name>.css` | usually | its look |
| `<name>.js` | no | its behaviour: `export default init(root, host, meta)`; `defineBlock` writes it |
| `<name>.example.md` | no | examples, written as an author would |

An author writes the block on a page as `:::<name>` … `:::`.
The platform binds the content to the fields, renders neutral HTML and reports content that does not fit.
The site owns the CSS and JavaScript.

## The definition

```json
{
  "$schema": "../../.foliwake/schemas/block-1.schema.json",
  "label": { "en": "Callout" },
  "fields": [
    { "name": "title", "type": "heading", "level": 3, "min": 0, "label": { "en": "Title" } },
    { "name": "text", "type": "text", "min": 1, "max": null, "label": { "en": "Text" } }
  ]
}
```

| Key | What |
| --- | --- |
| `fields` | the fields in order; content is bound to them by order and type |
| `label` | the block's name for editors, language → text; never changes the HTML |
| `argument` | `{ "name", "pattern" }`: a word after the name (`:::scene road/intro`), rendered as `data-argument` |
| `variants` | allowed words after the name (`""` is the bare form), rendered as `data-variant`; not with `argument` |
| `ui` | the block's own labels, UI language → key → text (see JavaScript below) |
| `events` | the events the block sends besides `ready` and `error`, with the type of each detail property |
| `index` | fields a build extension may index (for example for search) |
| `$schema` | for your editor only; the platform ignores it |

A definition that could bind the same content in two ways is refused.

### Fields

Every field has `name` (its `data-field` in the HTML) and `type`.
Optional: `label`, `min` (default 1; 0 = optional) and `max` (default 1; `null` = any number).

| Type | Markdown it reads | HTML it gives | Value in `fields` |
| --- | --- | --- | --- |
| `heading` (`level` 2–4) | a `##`/`###`/`####` heading | `<h3 data-field="title">` | text |
| `text` | a paragraph | `<p data-field="text">` | text |
| `list` | a bullet list | `<ul data-field="steps"><li data-item>` | `string[]` |
| `choices` | a task list `- [ ] …` / `- [x] … {#a1}` | `<ul data-field="options" data-select="single">` with `<li data-item data-option-id data-correct>` | `{ id, text, correct }[]` |
| `quote` | a block quote | `<blockquote data-field="quote"><p>…` | text |
| `image` | a paragraph that is one image `![alt](path "caption")` | `<figure data-field="picture"><img …><figcaption>` | `{ src, srcset, sizes, alt, caption, width, height }` |

- A field whose `max` is not 1 is wrapped once in `<div data-field="name">`; `fields` gives it as a list.
- Field text may have bold, italic and inline code.
- `choices` also takes `ids` (`required`, `optional`, `forbidden`), `correct` per variant
  (`exactly-one`, `at-least-one`, `any`) and `itemQuote` (a block quote allowed under an answer).

### Editor support

`create-foliwake` writes the JSON Schema of definitions to `.foliwake/schemas/block-1.schema.json` (git-ignored).
With `"$schema"` in a definition, VS Code completes keys and field types and marks mistakes; nothing to install.
The schema cannot express every rule; `npx @foliwake/site-check` reports the rest.

## Styles

- Put every rule in `@layer blocks` and under `[data-component="<name>"]`, so a block styles only itself.
- Select fields by attribute, `[data-field="title"]`, never by position or tag alone.
- Use the site's CSS variables (`--color-border`, `--space`, …) with fallbacks;
  an app that embeds the page supplies its own.

```css
@layer blocks {
  [data-component="callout"] {
    border-left: 4px solid var(--color-accent, currentColor);

    & [data-field="title"] { margin: 0 0 0.5rem; }
  }
}
```

## JavaScript: one contract, three ways

Whatever writes it, a block's script exports `init(root, host, meta)` (blocks contract `foliwake-blocks/2`).
The loader calls it once per block on the page and gets back `{ dispose }`.
The platform never builds your code: the browser loads the file as it is.

| | block-kit and `html` | a framework through `ctx.mount` | by hand |
| --- | --- | --- | --- |
| For | simple and medium blocks | components of React, Preact, Vue, … | special cases |
| Build | none | none (vendored React) or your own CI | none |
| You write | `defineBlock('name', (fields, ctx) => …)` | `defineBlock` with `ctx.mount(view, props)` | `export default function init(…)` |

The same callout three ways. With block-kit:

```js
// components/callout/callout.js
import { defineBlock, html } from '@foliwake/block-kit';

export default defineBlock('callout', ({ title = '' }, ctx) => {
  const hidden = ctx.state(false);
  ctx.effect(() => ctx.attrs(ctx.root, { 'data-collapsed': hidden.value }));
  ctx.render(() => html`<button type="button" aria-expanded=${!hidden.value} @click=${() => {
    hidden.value = !hidden.value;
    ctx.emit('toggle', { hidden: hidden.value, title });
  }}>${ctx.t(hidden.value ? 'show' : 'hide')}</button>`);
});
```

With React, through `ctx.mount` and the `reactView` helper that `create-foliwake --react` writes:

```js
// components/callout/callout.js
import { defineBlock } from '@foliwake/block-kit';
import { reactView } from '../../scripts/react-view.js';

const createCallout = (h) => function Callout({ title, text = [], hidden, hide, onToggle }) {
  return h('div', null,
    title ? h('h3', null, title) : null,
    hidden ? null : text.map((p, i) => h('p', { key: i }, p)),
    h('button', { type: 'button', 'aria-expanded': !hidden, onClick: onToggle }, hide));
};

export default defineBlock('callout', async (fields, ctx) => {
  const react = ctx.host?.has('react') ? ctx.host.react : await import('../../scripts/vendor/react.js');
  const props = { ...fields, hidden: false, hide: ctx.t('hide'), onToggle };
  const view = ctx.mount(reactView(react, createCallout(react.createElement)), props, { replace: true });
  function onToggle() {
    props.hidden = !props.hidden;
    view.update({ ...props, hide: ctx.t(props.hidden ? 'show' : 'hide') });
    ctx.emit('toggle', { hidden: props.hidden, title: fields.title ?? '' });
  }
});
```

By hand, with no kit:

```js
// components/callout/callout.js
export default function init(root, host, meta) {
  const label = (key) => host?.labels?.[key] ?? meta?.ui?.[host?.uiLang]?.[key] ?? meta?.ui?.en?.[key] ?? key;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label('hide');
  button.addEventListener('click', () => {
    const hidden = root.toggleAttribute('data-collapsed');
    button.textContent = label(hidden ? 'show' : 'hide');
  }, { signal: host?.signal });
  root.append(button);
  return { dispose: () => button.remove() };
}
```

All three read the labels and declare the event in `callout.json`:

```json
{
  "$schema": "../../.foliwake/schemas/block-1.schema.json",
  "label": { "en": "Callout" },
  "fields": [
    { "name": "title", "type": "heading", "level": 3, "min": 0, "label": { "en": "Title" } },
    { "name": "text", "type": "text", "min": 1, "max": null, "label": { "en": "Text" } }
  ],
  "ui": { "en": { "hide": "Hide", "show": "Show" }, "de": { "hide": "Ausblenden", "show": "Anzeigen" } },
  "events": { "toggle": { "detail": { "hidden": "boolean", "title": "string" } } }
}
```

Detail types are `string`, `number`, `boolean`, `string[]`, `number[]`, `boolean[]`, `object` or `unknown`.

## block-kit

```js
import { defineBlock, html, nothing } from '@foliwake/block-kit';
```

You do not install `@foliwake/block-kit` to use it.
Every page maps that specifier to the kit of its own code release (an import map in `<head>`),
and the platform adds the kit to every release.
Install it as a dev dependency only for its types, or to serve the files yourself.

**`defineBlock(name, setup, options?)`** makes the block's `init`.

- `name` is the block's folder; the loader refuses a module whose name differs (`LOADER_BLOCK_NAME_MISMATCH`).
- `setup(fields, ctx)` runs once per root. It may return a cleanup function, `{ dispose }`, or a promise of either.
- A second `init` on the same root returns the first result.
- When `host.signal` aborts, the block is disposed.
- After setup the kit sends `ready`, unless the block did.
- `options.prefix` names the events (default `block`: `block:toggle`).

| `ctx.` | What |
| --- | --- |
| `root`, `host`, `key`, `signal` | the block's element, the page's host, its key, a signal aborted on dispose |
| `fields` | the fields by name, read from the HTML before anything changed it |
| `field(name)` | the element of a field, or `null` |
| `id(suffix?)` | an id unique to this block instance, for `id`, `for` and `aria-*` |
| `attrs(el, values)` | sets attributes: `true` → `""`, `false`/`null`/`undefined` → removed |
| `on([target,] type, [selector,] handler)` | a listener that ends with the block; returns `off()` |
| `emit(type, detail)` | a bubbling `<prefix>:<type>` event with `{ key, block, ...detail }` |
| `t(key)` | a label: `host.labels[key]`, else the block's `ui` (UI language, its base, English), else the key |
| `state(initial)` | `{ value }`; replacing `value` re-renders the block's views and effects once per microtask |
| `effect(fn)` | runs now and after every state change; may return a cleanup |
| `render(view, { into? })` | renders an `html` view after the root's children, into a field or an element |
| `list(name, fn)` | for each item of a `list` or `choices` field: `fn(item, value, index)`; a returned view goes into it |
| `mount(view, props, options?)` | mounts a view of another framework: `{ render, unmount }`; returns `{ update, dispose, … }` |

`html` and `nothing` come from lit-html.
`html` writes the view without `innerHTML` or `eval`, and an update changes only what changed.

The starter block `quiz` (`create-foliwake --template examples`) is a complete example:
`ctx.list` turns each answer into a button, `ctx.state` remembers clicks,
and the block sends `answer` on every click and `complete` on the first right answer.

### Types in your editor

`create-foliwake` writes `jsconfig.json` and `.foliwake/types/foliwake.d.ts` (the kit's types, git-ignored).
Your editor then knows `defineBlock`, `ctx` and the host.
The types of each block's own fields, events and labels come from the Foliwake CLI, which is not public yet;
until then `fields` is a plain record.

## The host

On a Foliwake page, the loader gives every block the page's host:
`shell: 'foliwake'`, `lang`, `uiLang`, `theme`, `reducedMotion`, `channel`, `keyOf(root)` and `has(name)`.
Inside an app, the same block gets the app's host instead, which may add `labels`, `mode`, `track`, `react`
or an extension's members (for example `saved(key)` of the assessment extension).

Use an optional member only when `has(name)` is true, and fall back otherwise.
Then one block works on Foliwake pages and inside every app.

## Events

Blocks send the core types `ready` and `error`, the assessment extension's types
(`select`, `check`, `answer`, `reset`, `complete`) when they ask and grade, and their own types.
An app receives the core types and the types it names.

A site with its own event prefix keeps it in one module:

```js
// scripts/kit.js: block-kit with this site's event prefix.
import { defineBlock as define } from '@foliwake/block-kit';
export { html, nothing } from '@foliwake/block-kit';
export const defineBlock = (name, setup) => define(name, setup, { prefix: 'mysite' });
```

## React in blocks

React is never part of the kit.
Without a build step, `create-foliwake --react` vendors React and ReactDOM as one ES module,
`scripts/vendor/react.js` (about 68 KB gzipped, loaded only on pages with such a block).
Load it only when the host has no React of its own (`host.has('react')`), so an embedded page uses one React.

With a build step in your own CI, write JSX and import React from your build's shared chunk.
A code release accepts only relative imports and `@foliwake/block-kit`, never a bare `react`.

## Examples

`<name>.example.md` holds examples written like a page.
Each starts with a line `<!-- example: Title {#id} -->`, then the block as an author writes it:

```md
<!-- example: With a title {#titled} -->

:::callout

### Remember

The title is optional.

:::
```

The platform renders them in the block catalog of the preview.
`@foliwake/site-check` checks their file layout; only the platform renders them.

Next: [Check a site's code](/blocks/site-check).
