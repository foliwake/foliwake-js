# Concepts

One page on how the parts fit together.
Read it once; the guides and the reference assume it.

## Who does what

<Diagram name="who-does-what" alt="Authors write Markdown pages and block authors make Git commits; the Foliwake platform turns them into page HTML and code releases. On your side, the app developer uses the SDK: @foliwake/server or /next on the server reads, prepares and proxies; @foliwake/client or /react in the browser mounts blocks." />

The **platform** renders pages, captures code releases and serves both.
It is not part of this SDK.

The **SDK** (this repository) is what runs on your side:

| You are | You use | What it does |
| --- | --- | --- |
| a block author | `create-foliwake` | creates the site's code repository |
| | `@foliwake/block-kit` | the module your blocks import, and its types |
| | `@foliwake/site-check` | the checks the platform runs on every commit, locally |
| an app developer | `@foliwake/server`, `@foliwake/next` | read a page on your server, check it, proxy its code and pictures |
| | `@foliwake/client`, `@foliwake/react` | show the page and mount its blocks in the browser |
| both | `@foliwake/blocks-contract` | the types both sides agree on |

## Page HTML comes from the platform

An author writes Markdown.
A block is a fenced part of the page: `:::quiz` … `:::`.
The platform binds the content to the block's fields (from `components/quiz/quiz.json`) by order and type.
It reports content that does not fit instead of guessing.

The result is neutral HTML, **HTML contract 2**:

```html
<section data-section>
  <h2>Check yourself</h2>
  <div data-component="quiz" data-block-key="q1">
    <h3 data-field="question">Which sign means "stop"?</h3>
    <ul data-field="options" data-select="single">
      <li data-item data-option-id="a" data-correct="true">The red octagon</li>
      <li data-item data-option-id="b" data-correct="false">The yellow triangle</li>
    </ul>
  </div>
</section>
```

- Every block root is a `div[data-component="<name>"]`.
- Every field is an element with `data-field="<name>"`.
- The page is readable without any JavaScript.

## Blocks enhance that HTML

A block is a folder `components/<name>/` in the site's code repository:

| File | What |
| --- | --- |
| `<name>.json` | the definition: the block's fields, in order |
| `<name>.css` | its look |
| `<name>.js` | its behaviour (optional) |
| `<name>.example.md` | examples, written as an author would (optional) |

The script's default export is `init(root, host, meta)`.
A loader calls it once per block root on the page and gets back `{ dispose }`.
`defineBlock` from `@foliwake/block-kit` writes `init` for you:

```js
// components/note/note.js
import { defineBlock, html } from '@foliwake/block-kit';

export default defineBlock('note', (fields, ctx) => {
  const open = ctx.state(false);
  ctx.render(() => html`<button @click=${() => (open.value = !open.value)}>${ctx.t('more')}</button>`);
});
```

A block reads its fields from the HTML that is already there.
It never renders the page itself.

## Code releases and the import map

The platform captures the site's code from a clean Git commit into a **code release** `cd_…`.
A release holds `components/`, `scripts/`, `styles/`, `templates/`, `references/` and the site's settings files.
The platform adds the browser files of `@foliwake/block-kit` under `_foliwake/`.
A release never changes once it exists.

Every page names the release it was built with (the `X-Code-Release` header).
Its `<head>` has an **import map** that maps `@foliwake/block-kit` to the kit of that release:

```json
{ "scopes": { "/foliwake-code/cd_A/": { "@foliwake/block-kit": "/foliwake-code/cd_A/_foliwake/block-kit.js" } } }
```

So:

- the site installs nothing and builds nothing; the browser loads the files as they are;
- a block always runs with the kit it was released and tested with;
- two pages of different releases in one app do not interfere (the map is scoped to each release's path).

## Content and code are released separately

<Diagram name="release-flow" alt="A commit pushed to a branch gives a branch preview. A commit merged to main goes through site-check, becomes code release cd_N, the preview is rebuilt with it, and the release (auto or manual) takes it live." />

Publishing pages keeps the live code.
New code reaches live only through the preview, where every page is rebuilt with it first.
With the site setting `codeRelease: auto` (the default) it is released when every page builds without problems.
With `manual` it waits for **Release** in the Foliwake admin.

## The host

The host is one object per page that the loader (or your app) gives every block.
Its core members:

| Member | What |
| --- | --- |
| `contract`, `shell`, `htmlContract`, `channel` | which contract, which app, which page format, live or preview |
| `lang`, `uiLang`, `theme`, `reducedMotion` | how to present |
| `signal` | aborted when the page goes |
| `keyOf(root)` | the block's stable key |
| `has(name)` | whether an optional member is there |

Optional members (`labels`, `mode`, `track`, `react`, an extension's members) exist only when `has(name)` says so.
A block that reads only the core works on a Foliwake page and inside your app alike.

## Events and extensions

Blocks send bubbling `CustomEvent`s named `<prefix>:<type>`, with `{ key, block, … }` in `detail`.

- The core types are `ready` and `error`.
- The **assessment** extension (`@foliwake/blocks-contract/assessment`) adds `select`, `check`, `answer`,
  `reset` and `complete`, and the host members `mode` and `saved(key)`.
- An app receives the core types and the types it names in `events`.

The prefix appears in three places, and they must agree:
`defineBlock(…, { prefix })` in the blocks, `BLOCKS_CONTRACT.eventPrefix` of the site's blocks module,
and `app.blocks.eventPrefix` of the app's config.
A difference is reported as `EVENT_PREFIX_MISMATCH`.

## Embedding: envelope, prepare, mount

<Diagram name="embedding" alt="The browser opens /pages/x in your app; your server reads /x.plain.html from the origin with the credential and caches the envelope; preparePage runs per request and returns FoliwakePageData; the browser renders the body, imports the blocks module through your code proxy (the release is immutable), mounts blocks and receives their events." />

1. **Envelope.** Your server reads `<path>.plain.html` with the credential.
   What the origin answered (body, `X-Code-Release`, language, ETag) is the envelope.
   It is the only thing you cache.
2. **Prepare.** On every request, `preparePage` checks the body (no scripts, styles, frames, `on…` attributes),
   rewrites links and pictures, runs your `transform`, and checks again.
   The result, `FoliwakePageData`, is plain JSON for the browser.
3. **Mount.** In the browser, `@foliwake/client` (or `<FoliwakePage>`) imports the site's blocks module
   (`app.blocks.entry`, for example `scripts/blocks.js`) from your own code proxy.
   That module exports `BLOCKS_CONTRACT` and `mountBlocks(container, host)`.

Code and pictures go through your app's proxies (`/foliwake-code`, `/foliwake-media`).
The browser never talks to the Foliwake origin, no credential reaches it,
and your Content-Security-Policy stays `script-src 'self'`.

## Contract versions

| Name | Between | What it fixes |
| --- | --- | --- |
| HTML contract 2 | platform → everyone | the page markup: `data-section`, `data-component`, `data-field` |
| `foliwake-blocks/2` | blocks ↔ app | `init(root, host, meta)`, the host, the events, the blocks module |
| `foliwake.remote.json` v2 | app | the app's config: site, origins, credentials by variable name, app settings |
| plain/2 | origin → app | the origin sends `X-Code-Release` with `.plain.html` |

A minor version of a contract only adds.
A major version changes `init` or the host; a loader refuses a block of another major.

## site-check: the platform's own rules

`@foliwake/site-check` is the code the platform runs first on every commit.
Locally it gives the same codes, messages and fixes.
It checks block definitions, templates, settings files, the folder layout and script references.
It does not render pages or block examples; only the platform does.
