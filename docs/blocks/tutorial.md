# Tutorial: your first blocks

In this tutorial you create a site's code, write a block with block-kit and one with React,
check both with the platform's rules, and click them in a browser while you watch their events.
It takes about twenty minutes.

You need Node.js 22.22 or newer, and Python 3 or any other static file server.

## 1. Create the site's code

```sh
npm create foliwake@latest my-site -- --template examples --react
cd my-site
```

You get three example blocks (`note`, `steps`, `quiz`), a React block (`poll`),
the vendored React in `scripts/vendor/react.js` and its adapter `scripts/react-view.js`.
[Start a site's code](/blocks/start) explains every folder.

## 2. A block with state, render and emit

A callout: a title, some text, a "Hide"/"Show" button and a "Got it" button.
Create the folder `components/callout/` with four files.

`callout.json` defines the fields, the button labels and the block's own events:

```json
{
  "$schema": "../../.foliwake/schemas/block-1.schema.json",
  "label": { "en": "Callout" },
  "fields": [
    { "name": "title", "type": "heading", "level": 3, "min": 0, "label": { "en": "Title" } },
    { "name": "text", "type": "text", "min": 1, "max": null, "label": { "en": "Text" } }
  ],
  "ui": { "en": { "hide": "Hide", "show": "Show", "done": "Got it" } },
  "events": {
    "toggle": { "detail": { "hidden": "boolean", "title": "string" } },
    "complete": {}
  }
}
```

`callout.css` styles only this block:

```css
@layer blocks {
  [data-component="callout"] {
    border-left: 4px solid var(--color-accent, currentColor);
    padding: 0 var(--space, 1rem);

    & [data-field="title"] { margin: 0 0 0.5rem; }
    &[data-collapsed] [data-field="text"] { display: none; }
    &[data-done] { opacity: 0.6; }
  }
}
```

`callout.js` adds the buttons:

```js
// callout: a title and text, a "Hide"/"Show" button and a "Got it" button.
import { defineBlock, html } from '@foliwake/block-kit';

export default defineBlock('callout', ({ title = '' }, ctx) => {
  const hidden = ctx.state(false);
  const done = ctx.state(false);

  ctx.effect(() => {
    ctx.attrs(ctx.root, { 'data-collapsed': hidden.value, 'data-done': done.value });
  });
  ctx.render(() => html`
    <button type="button" aria-expanded=${!hidden.value} @click=${() => {
      hidden.value = !hidden.value;
      ctx.emit('toggle', { hidden: hidden.value, title });
    }}>${ctx.t(hidden.value ? 'show' : 'hide')}</button>
    <button type="button" ?disabled=${done.value} @click=${() => {
      done.value = true;
      ctx.emit('complete', {});
    }}>${ctx.t('done')}</button>`);
});
```

- `defineBlock('callout', setup)` makes the block's `init`. The name must be the folder's.
  `setup` gets the fields by name: an author may leave the title out, so never read them by position.
- `ctx.state(false)` is a value. Replacing it renders the block's views and effects again.
- ``ctx.render(() => html`…`)`` puts the buttons after the authored content.
  `@click` listens, `?disabled` sets or removes the attribute; an update changes only what changed.
- `ctx.effect` sets `data-collapsed` and `data-done` on the block, and `callout.css` reacts to them.
- `ctx.t('done')` is a label: the app's if it gives one, else `ui` in the reader's language, else English.
- `ctx.emit('toggle', …)` sends the bubbling event `block:toggle` with `{ key, block, hidden, title }`.

`callout.example.md` shows the block as an author writes it:

```md
<!-- example: With a title {#titled} -->

:::callout

### Before you publish

Run the checks first.

:::
```

## 3. Check it

```sh
npx @foliwake/site-check
```

```text
@foliwake/site-check 0.4.0 — site code in . (HTML contract 2)
23 files would be captured (components/, scripts/, …, site.yaml): 0 errors, 0 warnings, 0 notes.
```

Try a mistake: change `"heading"` to `"headline"` in `callout.json` and run it again.
The error names the file, the line and the fix.

## 4. A React star rating

Create `components/rating/` with `rating.json`:

```json
{
  "$schema": "../../.foliwake/schemas/block-1.schema.json",
  "label": { "en": "Rating" },
  "fields": [
    { "name": "title", "type": "heading", "level": 3, "min": 0, "label": { "en": "Title" } },
    { "name": "text", "type": "text", "min": 1, "max": null, "label": { "en": "Text" } }
  ],
  "ui": { "en": { "rate": "Your rating" } },
  "events": {
    "answer": { "detail": { "selected": "string[]", "correct": "unknown", "graded": "string" } }
  }
}
```

and `rating.js`:

```js
// rating: the title and text, then five stars, rendered with React.
import { defineBlock } from '@foliwake/block-kit';
import { reactView } from '../../scripts/react-view.js';

/** The view as a React component, for a given createElement. */
export function createRating(h) {
  const star = (n, stars, onRate) => h('button', {
    key: n,
    type: 'button',
    'aria-label': `${n} of 5`,
    'aria-pressed': n === stars,
    onClick: () => onRate(n),
  }, n <= stars ? '★' : '☆');

  return function Rating({ title, text = [], stars, label, onRate }) {
    return h('div', null,
      title ? h('h3', null, title) : null,
      ...text.map((paragraph, index) => h('p', { key: index }, paragraph)),
      h('p', { role: 'group', 'aria-label': label }, [1, 2, 3, 4, 5].map((n) => star(n, stars, onRate))));
  };
}

export default defineBlock('rating', async (fields, ctx) => {
  const react = ctx.host?.has('react') ? ctx.host.react : await import('../../scripts/vendor/react.js');
  const props = { ...fields, stars: 0, label: ctx.t('rate'), onRate };
  const view = ctx.mount(reactView(react, createRating(react.createElement)), props, { replace: true });
  function onRate(stars) {
    view.update({ ...props, stars });
    ctx.emit('answer', { selected: [String(stars)], correct: null, graded: 'local' });
  }
});
```

- The browser loads your files as they are, so the component is plain React without JSX.
- An app that embeds the page may give its own React (`host.has('react')`); otherwise the block imports the
  vendored one, only on pages that have the block.
- `ctx.mount` renders the component into the block with the fields as props.
  `replace: true` hides the authored HTML while React shows the block;
  if React fails, the authored HTML comes back.
- `view.update(props)` renders again. Each click sends `block:answer`, a type of the assessment extension.

Run `npx @foliwake/site-check` again: still no problems.

## 5. Click them and watch the events

The SDK does not render pages; the platform does.
To try the blocks now, write a small page by hand with the HTML the platform would give them.
It is not part of the code release, which captures only `components/`, `scripts/`, `styles/` and a few files.

Install the kit, so the page can load it:

```sh
npm install -D @foliwake/block-kit
```

Save `try.html` at the root of the repository:

```html
<!doctype html>
<html lang="en" data-html-contract="2">
<head>
  <meta charset="utf-8">
  <title>Try the blocks</title>
  <script type="importmap">
    { "imports": { "@foliwake/block-kit": "./node_modules/@foliwake/block-kit/dist/block-kit.js" } }
  </script>
  <link rel="stylesheet" href="styles/styles.css">
  <link rel="stylesheet" href="components/callout/callout.css">
</head>
<body>
  <div data-component="callout" data-block-key="c1">
    <h3 data-field="title">Before you publish</h3>
    <div data-field="text"><p>Run the checks first.</p></div>
  </div>
  <div data-component="rating" data-block-key="r1">
    <h3 data-field="title">How was this tutorial?</h3>
    <div data-field="text"><p>Rate it from one to five stars.</p></div>
  </div>
  <script type="module">
    // A stand-in for the platform's loader: each block's init with its own labels, no host.
    for (const root of document.querySelectorAll('[data-component]')) {
      const name = root.dataset.component;
      const { default: init } = await import(`./components/${name}/${name}.js`);
      const { ui } = await (await fetch(`./components/${name}/${name}.json`)).json();
      init(root, undefined, { name, ui });
    }
  </script>
</body>
</html>
```

The `text` field may repeat (`"max": null`), so its paragraphs are wrapped once in `<div data-field="text">`.
Serve the folder and open `http://localhost:8000/try.html`:

```sh
python3 -m http.server 8000
```

Open the browser console and listen to the blocks:

```js
for (const type of ['block:toggle', 'block:complete', 'block:answer']) {
  document.addEventListener(type, (event) => console.log(type, event.detail));
}
```

Click "Hide", "Got it" and the fourth star:

```text
block:toggle {key: 'c1', block: 'callout', hidden: true, title: 'Before you publish'}
block:complete {key: 'c1', block: 'callout'}
block:answer {key: 'r1', block: 'rating', selected: ['4'], correct: null, graded: 'local'}
```

Every event names its block and key. An app that embeds the page receives the types it names
([Embed pages](/embed/next-manual#step-6-host-and-events)).

## 6. On a real page

An author writes the block in a page:

```md
:::callout

### Before you publish

Run the checks first.

:::
```

Commit your work on a branch and push it. When the repository is connected to your site,
the branch preview shows the site's pages and the block catalog with your blocks
([Start a site's code](/blocks/start#connect-it-to-your-site)).

## Next

- [Write a block](/blocks/write-a-block): every field type, every `ctx` member, the host and events.
- [`@foliwake/block-kit`](/reference/packages/block-kit): `ctx.state` and `ctx.mount` in full.
- [Check a site's code](/blocks/site-check): the checker in CI.
