# @foliwake/client

<!-- usage -->

`@foliwake/client` shows a prepared Foliwake page inside any browser app and mounts the page's blocks (its
interactive parts) from the page's own code release. It has no framework dependency: it works with plain
DOM code, and it is the base of `@foliwake/react` and of any adapter you write for another framework (Vue,
Svelte, a web component). Use it directly when your app is not a React app; in a React or Next app use
`@foliwake/react` or `@foliwake/next` instead, which wrap it.

The page itself is prepared on your server (`preparePage` of `@foliwake/server`, or `readPage` of
`@foliwake/next`) and handed to the browser as a `FoliwakePageData` object. This package never talks to a
Foliwake origin: it imports the blocks module from your app's own code proxy (a same-origin URL).

## Install

The packages are published to GitHub Packages under the `@foliwake` scope. Add an `.npmrc` to your app:

```ini
@foliwake:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN` is a GitHub personal access token (classic) with `read:packages`; fine-grained tokens do
not work with this registry. Install an exact version, and use the same version for every `@foliwake/*`
package:

```bash
pnpm add @foliwake/client@0.1.0
```

## Minimal example

```ts
import { mountFoliwakePage, type FoliwakePageData } from '@foliwake/client';

// Your server prepares the page (see @foliwake/server) and serves it as JSON.
const page = (await (await fetch('/api/page?path=/lessons/a')).json()) as FoliwakePageData;

const mount = mountFoliwakePage(document.querySelector<HTMLElement>('#lesson')!, {
  page,
  onStatus: (status) => console.log('blocks:', status), // mounting → ready | partial | static | error
  stylesheets: true, // add the blocks' stylesheets to <head>; removed with the last mount of the release
});

// When the view goes away (idempotent; no callback runs after it):
mount.dispose();
```

The element may be empty (the body is inserted) or already hold the body your server rendered (it is kept on
the first mount). If the page cannot get blocks (no code release, another contract major, a failing module),
the body stays readable, the status is `static` and `onError` says why.

## Examples

### Give blocks a host and save their answers

The host is your app's side of the blocks contract: labels for block chrome, analytics, and the members of an
extension your blocks speak. The core events are `ready` and `error`; name the other types you want in
`events`. A site with exercises types its host and events with `@foliwake/blocks-contract/assessment` (saved
answers, `answer` events). A function as `host` is read again at every access, so newer data takes effect
without a remount.

```ts
import { mountFoliwakePage, type FoliwakePageData } from '@foliwake/client';
import type { AssessmentEvents, AssessmentHostMembers, SavedAnswer } from '@foliwake/blocks-contract/assessment';

declare const page: FoliwakePageData;
const answers = new Map<string, SavedAnswer>();

const mount = mountFoliwakePage<AssessmentHostMembers, AssessmentEvents>(document.querySelector<HTMLElement>('#lesson')!, {
  page,
  host: () => ({
    mode: 'practice',
    labels: { check: 'Check', retry: 'Try again' },
    saved: (key) => answers.get(key) ?? null,
    track: (name, data) => console.debug('track', name, data),
  }),
  events: ['select', 'check', 'answer', 'reset', 'complete'],
  onEvent: (event) => {
    if (event.type !== 'answer') return;
    const { key, selected, correct } = event.detail;
    answers.set(key, { selected, correct });
    void fetch('/api/answers', { method: 'POST', body: JSON.stringify({ key, selected, correct }) });
  },
  onError: ({ code, message }) => console.warn(code, message),
});
```

### Change the page or the callbacks without leaking

`update()` passes new callbacks or host data (no remount). A `page` with another `identity` (a new body, code
release, channel or mode) disposes the old mount and mounts the new page on the pristine element. An
`AbortSignal` disposes the mount when your view's lifetime ends.

```ts
import { mountFoliwakePage, type FoliwakePageData } from '@foliwake/client';

declare const first: FoliwakePageData;
declare const next: FoliwakePageData;

const view = new AbortController();
const mount = mountFoliwakePage(document.querySelector<HTMLElement>('#lesson')!, { page: first, signal: view.signal });

mount.update({ host: { labels: { check: 'Prüfen' } } }); // latest wins, no remount
mount.update({ page: next });                            // another identity: dispose, then mount `next`
view.abort();                                            // same as mount.dispose()
```

### Listen to block events outside the mount

`subscribeBlockEvents` routes `<prefix>:<type>` events under any element to typed handlers, for example a
progress bar next to the page. The prefix is the config's `app.blocks.eventPrefix` (`clientSettings(config)`
on the server gives it to the browser); `types` names the event types besides the core `ready` and `error`.

```ts
import { subscribeBlockEvents } from '@foliwake/client';
import type { AssessmentEvents } from '@foliwake/blocks-contract/assessment';

const stop = subscribeBlockEvents<AssessmentEvents>(
  document.querySelector('#lesson')!,
  {
    answer: (event) => console.log(event.detail.key, event.detail.correct),
    complete: (event) => console.log('done:', event.detail.block),
    error: (event) => console.warn(event.detail.code),
  },
  { prefix: 'demo', types: ['answer', 'complete'] },
);
// later: stop()
```

### Wrap it as a custom element

An adapter for any framework has the same shape: mount on connect, `update` on changes, `dispose` on
disconnect, and use `pageIdentity(page)` as the framework's key.

```ts
import { mountFoliwakePage, type FoliwakeMount, type FoliwakePageData } from '@foliwake/client';

class FoliwakePageElement extends HTMLElement {
  #mount: FoliwakeMount | null = null;
  #page: FoliwakePageData | null = null;
  set page(page: FoliwakePageData) {
    this.#page = page;
    if (this.#mount) this.#mount.update({ page });
    else if (this.isConnected) this.connectedCallback();
  }
  connectedCallback() {
    if (this.#page && !this.#mount) this.#mount = mountFoliwakePage(this, { page: this.#page, shell: 'web-component', stylesheets: true });
  }
  disconnectedCallback() {
    this.#mount?.dispose();
    this.#mount = null;
  }
}
customElements.define('foliwake-page', FoliwakePageElement);
```

## Compatibility

| | |
| --- | --- |
| Browsers | ES2022 with dynamic `import()` (tested in Chrome) |
| Blocks contract | `foliwake-blocks/2` (host minor 0) |
| Page data | from `@foliwake/server` or `@foliwake/next` of the same version |
| Frameworks | none required; React 19.2+ through `@foliwake/react` |

Importing the package on a server is safe: nothing touches the DOM before a call.

## Good to know

- Only `page.identity` remounts. Callbacks and host data are read at call time; every async step is
  abort-guarded; `dispose()` is idempotent and no callback runs after it. A second mount on the same element
  starts from the pristine body.
- Block stylesheets are counted per code release: with `stylesheets: true` they are added once and removed
  when the last mount of that release goes. `pageStylesheets(page)` (and `stylesheets: true`) link
  `components/<name>/<name>.css` for every block name on the page; it does not read the release's
  `components/components.json`, so a block without a stylesheet gets a link that answers 404 (harmless, but
  visible in the network panel). The server's preload hints (`page.preload` from `readPage`, entries with
  `as: 'style'`) list only the stylesheets that exist; render those yourself if the 404s matter.
- Lifecycle hooks (`hooks: { site, template }`, phases `beforeBlocks`, `afterFirstSection`, `lazy`, `delayed`)
  are an extension point. A hook gets a `signal` and must check it after each `await`; a running hook is not
  stopped by dispose.

## Guides

- [Embed Foliwake pages in a React or Next app](https://docs.foliwake.dev/guide/embed-in-react) (section
  "Without a framework, or with another one" covers adapters)
- [Write a block](https://docs.foliwake.dev/guide/write-a-block)

License: Apache-2.0.

<!-- usagestop -->

## API

<!-- api -->

<!-- Generated by `pnpm packages:reference` from the type declarations; do not edit by hand. -->

### `@foliwake/client`

**Functions and components**

#### `acquireCss()`

Counts a mount of `codeRelease`; returns the release function (idempotent).

```ts
function acquireCss(doc: Document, codeRelease: string): () => void
```

**Returns** `() => void`

#### `createHost()`

The host a page's blocks receive. `init` (or what it returns) is read at every call. `base.shell` is the shell named when the app names none (default `'web'`; the React package passes `'react'`).

```ts
function createHost<Ext extends object = Record<never, never>>(init: HostInit<Ext> | (() => HostInit<Ext>), base: {
    signal: AbortSignal;
    page: FoliwakePageData;
    shell?: string;
}): BlockHost<Ext>
```

| Parameter | Type | Description |
| --- | --- | --- |
| `init` | `HostInit<Ext> \| (() => HostInit<Ext>)` | The app's part of the host, or a function returning it (called at every member read). |
| `base` | `{ signal: AbortSignal; page: FoliwakePageData; shell?: string; }` | The mount's signal, the page and the default shell. |

**Returns** `BlockHost<Ext>`: A `BlockHost<Ext>` for `mountBlocks`: contract, signal, HTML contract and channel come from the page; `has(name)` is true for the optional members the app gave (core and extension alike).

#### `cssMounts()`

Mounts per code release in this document (tests, diagnostics).

```ts
function cssMounts(doc: Document): Record<string, number>
```

**Returns** `Record<string, number>`

#### `ensureImportMap()`

Adds the page's import map to the document's head unless a map for its code base that the browser read is there.

```ts
function ensureImportMap(doc: Document, page: Pick<FoliwakePageData, 'codeBase'>): void
```

**Returns** `void`

#### `importBlocksModule()`

Imports a code release's blocks module from a same-origin URL at run time (bundlers leave the import alone). `mountFoliwakePage` calls it with `page.blocksUrl`.

```ts
function importBlocksModule(url: string): Promise<BlocksModule>
```

**Returns** `Promise<BlocksModule>`

#### `listenBlockEvents()`

Listens on `target` for the core event types and `types`; returns the function that removes the listeners (idempotent).

```ts
function listenBlockEvents<Events extends object = BlockEvents>(target: Element, prefix: string, deliver: (event: FoliwakeEvent<Events>) => void, types?: readonly string[]): () => void
```

| Parameter | Type | Description |
| --- | --- | --- |
| `target` | `Element` |  |
| `prefix` | `string` | The event prefix (`app.blocks.eventPrefix`), without the colon. |
| `deliver` | `(event: FoliwakeEvent<Events>) => void` | Called with each event; native events that are not `CustomEvent`s are ignored. |
| `types?` | `readonly string[]` | Event types besides the core ones (an extension's, the site's own). |

**Returns** `() => void`

#### `mountFoliwakePage()`

Shows `options.page` in `element` and mounts its blocks from the page's own code release. Problems of the blocks (no code release, another contract, a failing module) go to `onError` / `onStatus`; the body stays.

```ts
function mountFoliwakePage<Ext extends object = Record<never, never>, Events extends object = BlockEvents>(element: HTMLElement, options: FoliwakeMountOptions<Ext, Events>): FoliwakeMount<Ext, Events>
```

| Parameter | Type | Description |
| --- | --- | --- |
| `element` | `HTMLElement` | The element that holds (or will hold) the page body, already in the document. |
| `options` | `FoliwakeMountOptions<Ext, Events>` |  |

**Returns** `FoliwakeMount<Ext, Events>`: The mount: `update()` for new callbacks or another page, `dispose()` on unmount.

#### `pageIdentity()`

The key a framework adapter remounts on (its `key`): site, channel, path, ETag, code release, mode and a digest of the final body and its mount settings.

```ts
function pageIdentity(page: FoliwakePageData): string
```

**Returns** `string`

#### `pageImportMap()`

The import map text of a page's code release (scoped to its code base), or null for a page without one.

```ts
function pageImportMap(page: Pick<FoliwakePageData, 'codeBase'>): string | null
```

**Returns** `string \| null`

#### `pageStylesheets()`

The stylesheets of the body's blocks in its code release (for an adapter that renders them with the body).

```ts
function pageStylesheets(page: FoliwakePageData): {
    name: string;
    href: string;
    codeRelease: string;
}[]
```

**Returns** `{ name: string; href: string; codeRelease: string; }[]`

#### `subscribeBlockEvents()`

Block events under `target` to typed handlers by type. `handlers` may be a function returning the current handlers: it is read at event time (latest wins, no re-subscribe). Returns the unsubscribe function.

```ts
function subscribeBlockEvents<Events extends object = BlockEvents>(target: Element, handlers: FoliwakeEventHandlers<Events> | (() => FoliwakeEventHandlers<Events>), opts: {
    prefix: string;
    types?: readonly string[];
    signal?: AbortSignal;
}): () => void
```

| Parameter | Type | Description |
| --- | --- | --- |
| `target` | `Element` |  |
| `handlers` | `FoliwakeEventHandlers<Events> \| (() => FoliwakeEventHandlers<Events>)` |  |
| `opts` | `{ prefix: string; types?: readonly string[]; signal?: AbortSignal; }` | `prefix`: the event prefix, without the colon; `types`: event types besides the core ones; `signal`: aborting it unsubscribes. |

**Returns** `() => void`

**Constants**

#### `BLOCK_EVENT_TYPES`

The core block event types, in a fixed order; an event is `<prefix>:<type>` (for example `demo:ready`).

```ts
const BLOCK_EVENT_TYPES: readonly BlockEventType[]
```

#### `HOOK_PHASES`

The lifecycle phases a hook can run in, in phase order.

```ts
const HOOK_PHASES: readonly ["beforeBlocks", "afterFirstSection", "lazy", "delayed"]
```

#### `HOST_CONTRACT_MINOR`

The contract minor this package speaks.

```ts
const HOST_CONTRACT_MINOR = 0
```

**Interfaces**

#### `FoliwakeHookContext`

What a lifecycle hook receives.

```ts
interface FoliwakeHookContext
```

| Member | Type | Description |
| --- | --- | --- |
| `phase` | `FoliwakeHookPhase` |  |
| `container` | `HTMLElement` |  |
| `page` | `FoliwakePageData` |  |
| `signal` | `AbortSignal` | Aborted on dispose: a hook stops its work. |

#### `FoliwakeHooks`

Lifecycle hooks (extension point; the full hooks contract comes later). In each phase the site's hook runs before the template's; a hook's promise is awaited before the next one, raced against the mount's signal (a slow hook never holds up dispose). A failing hook is reported (`onError` HOOK_FAILED) and the lifecycle goes on. No hook starts after dispose, but a hook already running is not stopped: cancellation is cooperative, so a hook checks `signal.aborted` after each await and cleans up what it started (the same element may already hold the next page's mount). 0.1 timing: `beforeBlocks` after the module loaded and passed the contract check, before `mountBlocks`; `afterFirstSection` right after `mountBlocks` returned (a body is one section in 0.1); `lazy` once `handle.ready` settled; `delayed` after `lazy`, on a later task.

```ts
interface FoliwakeHooks
```

| Member | Type | Description |
| --- | --- | --- |
| `site?` | `FoliwakePhaseHooks` |  |
| `template?` | `FoliwakePhaseHooks` |  |

#### `FoliwakeMount`

A running mount, returned by `mountFoliwakePage`.

```ts
interface FoliwakeMount<Ext extends object = Record<never, never>, Events extends object = BlockEvents>
```

| Member | Type | Description |
| --- | --- | --- |
| `readonly element` | `HTMLElement` | The element the page is mounted in. |
| `readonly page` | `FoliwakePageData` | The current page (the latest one passed to `update`). |
| `readonly status` | `FoliwakePageStatus \| 'idle' \| 'disposed'` | The last status reported; 'disposed' after dispose. |
| `update()` | `(next: FoliwakeMountCallbacks<Ext, Events> & { page?: FoliwakePageData; }) => void` | New callbacks or host (latest wins, no remount); a `page` with another identity remounts. |
| `dispose()` | `() => void` | Idempotent. Leaves the DOM as it is; no callback runs after it. |

#### `FoliwakeMountCallbacks`

What may change during a mount (`update()`); read at call time.

```ts
interface FoliwakeMountCallbacks<Ext extends object = Record<never, never>, Events extends object = BlockEvents>
```

| Member | Type | Description |
| --- | --- | --- |
| `host?` | `HostInit<Ext> \| (() => HostInit<Ext>)` | The app's part of the block host (core members and its extension's); a function is called at every member read. |
| `onEvent?` | `(event: FoliwakeEvent<Events>) => void` | Every block event under the element (`<prefix>:<type>`) of the core types and `events`, as a typed `FoliwakeEvent`. |
| `events?` | `readonly string[]` | Event types delivered to `onEvent` besides the core `ready` and `error` (an extension's, the site's own). |
| `requireBlocks?` | `boolean` | Without blocks the page is `error` instead of `static`. |
| `onStatus?` | `(status: FoliwakePageStatus, reports?: MountReport[]) => void` | Each status change; `reports` (one per block root) once the blocks settled. |
| `onError?` | `(error: FoliwakePageError) => void` | Why blocks are missing or failed (the page still shows its body). |
| `onMount?` | `(container: HTMLElement, handle: MountHandle) => void` | Imperative app logic on the mounted container (slides, focus). |
| `hooks?` | `FoliwakeHooks` | Lifecycle hooks by phase, site-level then template-level (FoliwakeHooks). |

#### `FoliwakeMountOptions`

Options of `mountFoliwakePage`: the page, how to treat the element's body, and the callbacks.

```ts
interface FoliwakeMountOptions<Ext extends object = Record<never, never>, Events extends object = BlockEvents> extends FoliwakeMountCallbacks<Ext, Events>
```

| Member | Type | Description |
| --- | --- | --- |
| `page` | `FoliwakePageData` | The prepared page (from `preparePage` / `readPage` on the server). |
| `body?` | `'auto' \| 'insert' \| 'keep'` | The body in the element before blocks mount. `'auto'` (default): insert `page.html` when the element is empty or was mounted before (a remount starts pristine), keep server-rendered or framework-rendered HTML otherwise. `'insert'`: always insert. `'keep'`: never touch it (the caller restores it). |
| `stylesheets?` | `boolean` | Add `<link rel="stylesheet">` for the body's blocks to &lt;head&gt;, owned by the CSS count (default false). |
| `shell?` | `string` | `host.shell` when the app's host names none (default 'web'). |
| `blocks?` | `() => Promise<BlocksModule>` | Build-time mode (later): the blocks module from the app's bundle instead of the code release. |
| `signal?` | `AbortSignal` | Aborting it disposes the mount. |

#### `FoliwakePageError`

What `onError` receives. Codes: `NO_CODE_RELEASE`, `NO_BLOCKS_ENTRY`, `BLOCKS_CONTRACT_UNSUPPORTED`, `BLOCKS_MODULE_FAILED`, `BLOCKS_MOUNT_FAILED`, `BLOCKS_READY_FAILED`, `EVENT_PREFIX_MISMATCH`, `HOOK_FAILED`.

```ts
interface FoliwakePageError
```

| Member | Type | Description |
| --- | --- | --- |
| `code` | `string` |  |
| `message` | `string` |  |

**Types**

#### `FoliwakeEventHandlers`

One optional handler per event type of `Events`, each receiving the typed event.

```ts
type FoliwakeEventHandlers<Events extends object = BlockEvents> = {
    [T in BlockEventType<Events>]?: (event: FoliwakeEvent<Events, T>) => void;
}
```

#### `FoliwakeHook`

A lifecycle hook; a returned promise is awaited (raced against `signal`).

```ts
type FoliwakeHook = (context: FoliwakeHookContext) => void | Promise<void>
```

#### `FoliwakeHookPhase`

One of `HOOK_PHASES`.

```ts
type FoliwakeHookPhase = (typeof HOOK_PHASES)[number]
```

#### `FoliwakePageStatus`

Where a mount is: `mounting` (module loading), `ready` (every block mounted), `partial` (some blocks failed), `static` (the body is shown without blocks; `onError` says why), `error` (only with `requireBlocks`: no blocks, or every block failed).

```ts
type FoliwakePageStatus = 'mounting' | 'ready' | 'partial' | 'static' | 'error'
```

#### `FoliwakePhaseHooks`

Hooks of one level (site or template), by phase.

```ts
type FoliwakePhaseHooks = {
    [P in FoliwakeHookPhase]?: FoliwakeHook;
}
```

#### `HostInit`

The app's part of the host: the core members it may set, and the members of its extension (`Ext`).

```ts
type HostInit<Ext extends object = Record<never, never>> = Partial<Omit<HostCore, 'signal' | 'contract' | 'htmlContract' | 'channel' | 'has'>> & Partial<Ext>
```

**Also exported** (documented where they are defined)

- from `@foliwake/blocks-contract`: `BlockEventDetail`, `BlockEvents`, `BlockEventType`, `BlockHost`, `BlocksModule`, `ContractVersion`, `FoliwakeEvent`, `HostCore`, `MountHandle`, `MountReport`, `MountStatus`
- from `@foliwake/blocks-contract/page`: `ClientSettings`, `FoliwakePageData`

<!-- apistop -->
