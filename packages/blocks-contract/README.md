# @foliwake/blocks-contract

<!-- usage -->

`@foliwake/blocks-contract` holds the TypeScript types of the Foliwake blocks contract `foliwake-blocks/2`:
what a site's blocks module exports (`BLOCKS_CONTRACT`, `mountBlocks`) and what each block's module exports
(`init(root, host, meta)`), the host an app gives every block, the block events, and the page types that
`@foliwake/server` produces and `@foliwake/client` / `@foliwake/react` consume. Its only runtime code is
`/import-map` and the reserved names of `/reserved`.

The core knows no kind of site: its host has the language, labels, theme, motion preference, channel, media
and a signal; its events are `ready` and `error`, each carrying `key` and `block`. A kind of site extends it
with `BlockHost<Ext>` and `BlockEvents<Ext>`. The package ships one such extension, `/assessment`, for blocks
that ask and grade (answers, verdicts, saved answers, `answer` and `complete` events).

| Entry | Types |
| --- | --- |
| `@foliwake/blocks-contract` | `BlocksModule`, `MountHandle`, `MountReport`, `MountStatus`, `BlockInit`, `BlockMeta`, `BlockHandle`, `BlockHost`, `HostCore`, `HostReact`, `KnownShell`, `BlockEvents`, `BlockEventDetail`, `FoliwakeEvent` |
| `@foliwake/blocks-contract/assessment` | `AssessmentHost`, `AssessmentHostMembers`, `AssessmentEvents`, `AssessmentMode`, `Answer`, `SavedAnswer`, `Verdict` |
| `@foliwake/blocks-contract/import-map` | `pageImportMap(page)`: the import map of a code release (`@foliwake/block-kit` → its block-kit, scoped to its code path), shared by `@foliwake/server` and `@foliwake/client`; `KIT_SPECIFIER`, `KIT_PATH` |
| `@foliwake/blocks-contract/reserved` | `BLOCK_ATTRIBUTES`, `KNOWN_SHELLS`, `HOST_CONTEXT_KEY`: names of the contract as values |
| `@foliwake/blocks-contract/page` | `PageEnvelope` (the origin's answer, the only thing an app caches), `FoliwakePageData` (the prepared page a client component receives), `ClientSettings`, `PreloadHint`, `QueryIndex` |

A change here is a contract change: minor versions of the contract only add.

## Install

The packages are published on npm (npmjs.com) under the `@foliwake` scope; no registry setup or token is
needed. Install an exact version, the same as your other `@foliwake/*` packages; as it holds only types, a dev
dependency is enough:

```bash
pnpm add -D @foliwake/blocks-contract@0.3.0
```

## Minimal example

```ts
import type { BlocksModule } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';

export function describe(page: FoliwakePageData, blocks: BlocksModule): string {
  return `${page.path}: ${page.blocks.length} blocks, module speaks foliwake-blocks/${blocks.BLOCKS_CONTRACT.major}`;
}
```

## Examples

### Write a block's init by hand

A block's module exports `init(root, host, meta)` as its default; a loader calls it once per root with the
page's host and, when it has it, `meta`: what the code release says about the block (its name and its `ui`
labels; the loader of `foliwake create` projects passes it from `components/components.json`). `meta` is
optional, so a block falls back without it. The block-kit's `defineBlock` writes `init` for you; by hand it
looks like this.

```ts
// components/note/note.ts (compiled to note.js)
import type { BlockEventDetail, BlockEvents, BlockInit } from '@foliwake/blocks-contract';

const init: BlockInit = (root, host, meta) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = host.labels?.more ?? meta?.ui?.[host.uiLang]?.more ?? 'More';
  button.addEventListener('click', () => root.classList.toggle('open'), { signal: host.signal });
  root.append(button);
  const detail: BlockEventDetail<BlockEvents, 'ready'> = { key: host.keyOf(root), block: meta?.name ?? 'note', contract: 2 };
  root.dispatchEvent(new CustomEvent('block:ready', { detail, bubbles: true }));
  return { dispose: () => button.remove() };
};
export default init;
```

### Write a blocks module

A code release's blocks module (`app.blocks.entry`, for example `scripts/blocks.js`) exports
`BLOCKS_CONTRACT` and `mountBlocks`. `mountBlocks` mounts every `[data-component]` root in the container and
returns a handle; blocks emit `<prefix>:<type>` events that bubble from their root. This one speaks the
assessment extension: it restores saved answers and reports new ones.

```ts
// scripts/blocks.ts (compiled to scripts/blocks.js in the site's code)
import type { BlockEventDetail, BlocksModule, MountHandle, MountReport } from '@foliwake/blocks-contract';
import type { AssessmentEvents, AssessmentHost } from '@foliwake/blocks-contract/assessment';

const PREFIX = 'demo';

export const BLOCKS_CONTRACT: BlocksModule['BLOCKS_CONTRACT'] = { major: 2, minor: 0, eventPrefix: PREFIX };

export function mountBlocks(container: Element, host?: AssessmentHost): MountHandle {
  const cleanups: (() => void)[] = [];
  const reports: MountReport[] = [];
  for (const root of container.querySelectorAll<HTMLElement>('[data-component="choice"]')) {
    const key = host?.keyOf(root) ?? root.dataset.blockKey ?? '';
    const restored = host?.has('saved') ? host.saved?.(key) ?? null : null;
    if (restored) root.dataset.selected = restored.selected.join(' ');
    const onClick = (event: Event) => {
      const option = (event.target as Element).closest<HTMLElement>('[data-option]');
      if (!option || host?.signal.aborted) return;
      const detail: BlockEventDetail<AssessmentEvents, 'answer'> = { key, block: 'choice', selected: [option.dataset.option!], correct: null, graded: 'local' };
      root.dispatchEvent(new CustomEvent(`${PREFIX}:answer`, { detail, bubbles: true }));
    };
    root.addEventListener('click', onClick);
    cleanups.push(() => root.removeEventListener('click', onClick));
    reports.push({ root, name: 'choice', key, status: 'ready' });
  }
  return {
    ready: Promise.resolve(reports),
    dispose: () => cleanups.splice(0).forEach((cleanup) => cleanup()),
  };
}

// The module as a whole satisfies the contract.
export default { BLOCKS_CONTRACT, mountBlocks } satisfies BlocksModule;
```

### Write a host by hand

`@foliwake/client` builds the host for you (`createHost`). Without it, an app gives every block an object of
this shape; the optional members it has are announced by `has(name)`. Its own extension is a type argument.

```ts
import type { BlockHost } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';

/** This app's extension: where to send feedback. */
interface FeedbackMembers {
  feedback?(key: string, text: string): void;
}

export function makeHost(page: FoliwakePageData, signal: AbortSignal): BlockHost<FeedbackMembers> {
  const optional = new Set(['labels', 'signal', 'channel', 'feedback']);
  return {
    contract: { major: 2, minor: 0 },
    shell: 'my-app',
    htmlContract: page.htmlContract,
    channel: page.channel,
    lang: page.lang ?? (document.documentElement.lang || 'en'),
    uiLang: 'en',
    labels: { more: 'More' },
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    signal,
    keyOf: (root) => root.getAttribute('data-block-key') ?? '',
    feedback: (key, text) => void fetch('/api/feedback', { method: 'POST', body: JSON.stringify({ key, text }) }),
    has: (feature) => optional.has(feature),
  };
}
```

### Type events and pages in your own code

```ts
import type { BlockEvents, BlockEventType, FoliwakeEvent } from '@foliwake/blocks-contract';
import type { AssessmentEvents } from '@foliwake/blocks-contract/assessment';
import type { FoliwakePageData, PageEnvelope } from '@foliwake/blocks-contract/page';

/** A handler for one event type gets that type's detail. */
export function onAnswer(event: FoliwakeEvent<AssessmentEvents, 'answer'>): void {
  console.log(event.detail.key, event.detail.selected, event.detail.graded);
}

/** The union narrows by `type`. */
export function describeEvent(event: FoliwakeEvent<BlockEvents>): string {
  return event.type === 'error' ? `${event.detail.block}: ${event.detail.code}` : `${event.detail.block} ready`;
}

export const interesting: BlockEventType<AssessmentEvents>[] = ['answer', 'complete'];

/** What to store in your own cache: the envelope, never the prepared page (prepare per request). */
export function cacheKey(envelope: PageEnvelope): string {
  return `${envelope.site}|${envelope.channel}|${envelope.path}|${envelope.etag ?? ''}`;
}

export const isStatic = (page: FoliwakePageData): boolean => page.blocksUrl === null;
```

## Rules and reserved names

- **The host is always given.** A loader always calls `init(root, host, meta)` with the page's host, so `host`
  is required in `BlockInit`. A block may also run without one (an editor, a test) and fall back to what the
  browser gives; the block kit's `defineBlock` does (its init takes `host?`).
- **A block may declare its contract major**: `init.contract = 2` (the block kit sets it). A loader refuses a
  block that declares another major with the code `LOADER_BLOCK_CONTRACT`; a block that declares none is
  accepted. (A blocks module declares its own major in `BLOCKS_CONTRACT`; `@foliwake/client` refuses another one
  with `BLOCKS_CONTRACT_UNSUPPORTED`.)
- **The kit's specifier is `@foliwake/block-kit`**, the npm name of the kit, so its types need no path
  mapping.
- **Attributes** a loader and an app share (`BLOCK_ATTRIBUTES`): `data-component` on a block root (written by the
  engine), `data-component-status` (`loading` · `ready` · `error`) and `data-block-key` on a root, and
  `data-component-css` (the block's name) with `data-code-release` on a block's stylesheet link.
- **Shells** (`KNOWN_SHELLS`): `next`, `react`, `foliwake`, `webview`, and `web-component`, reserved for a
  custom-element host adapter (`<foliwake-page>`; not implemented yet). Another app may name its own shell.
- **Context key** `foliwake:host` (`HOST_CONTEXT_KEY`, a string, not a Symbol): reserved for the DOM context
  protocol (`context-request` events), so that a nested island can ask for the host in a later minor version.
  Nothing answers it yet; the host is the parameter of `init`.

## Compatibility

| | |
| --- | --- |
| Contract | `foliwake-blocks/2` (minor 0): the core, and the `/assessment` extension |
| TypeScript | types only; written for TypeScript 5.9 |
| Node.js | 22.22 or newer (`engines`) |

Changes per version, breaking ones marked: `CHANGELOG.md` in the package
(`node_modules/@foliwake/blocks-contract/CHANGELOG.md`).

## Guides

- [Write a block](https://docs.foliwake.dev/guide/write-a-block)
- [Embed Foliwake pages in a React or Next app](https://docs.foliwake.dev/guide/embed-in-react)

License: Apache-2.0.

<!-- usagestop -->

## API

<!-- api -->

<!-- Generated by `pnpm packages:reference` from the type declarations; do not edit by hand. -->

### `@foliwake/blocks-contract`

**Interfaces**

#### `BlockHandle`

What a block's `init` returns.

```ts
interface BlockHandle
```

| Member | Type | Description |
| --- | --- | --- |
| `dispose()` | `() => void` | Idempotent. Ends the block's listeners, timers and islands; leaves its authored HTML. |

#### `BlockMeta`

What a loader knows about a block from the code release's `components/components.json`.

```ts
interface BlockMeta
```

| Member | Type | Description |
| --- | --- | --- |
| `name` | `string` | The block's name (its folder, `data-component`). |
| `ui?` | `BlockLabels` | The block's own labels by UI language (its JSON `ui`), the fallback after `host.labels`. |

#### `BlocksModule`

What `<code release>/<blocks.entry>` exports.

```ts
interface BlocksModule
```

| Member | Type | Description |
| --- | --- | --- |
| `BLOCKS_CONTRACT` | `ContractVersion & { eventPrefix?: string; }` | `eventPrefix`: the prefix its blocks emit events with; absent → the app's configured one. |
| `mountBlocks()` | `(container: Element, host?: BlockHost) => MountHandle` | Mounts every `[data-component]` root inside `container`; `host` optional (the module's browser host then). |

#### `ContractVersion`

The version a code release or a host speaks.

```ts
interface ContractVersion
```

| Member | Type | Description |
| --- | --- | --- |
| `major` | `2` |  |
| `minor` | `number` |  |

#### `CoreEventDetails`

The `detail` of the core event types (besides `key` and `block`).

```ts
interface CoreEventDetails
```

| Member | Type | Description |
| --- | --- | --- |
| `ready` | `{ contract: number; }` | The block finished its setup: the block sends it, or the block-kit after setup when it did not (unless the block opted out with `defineBlock(…, { autoReady: false })`). |
| `error` | `{ code: string; message: string; recoverable: boolean; }` |  |

#### `HostCore`

The members every host has (the core of `BlockHost`). Optional members are announced by `has(name)`.

```ts
interface HostCore
```

| Member | Type | Description |
| --- | --- | --- |
| `contract` | `ContractVersion` |  |
| `shell` | `KnownShell \| (string & {})` | Which app mounts: one of KnownShell, or another app's own name. |
| `htmlContract` | `string` | HTML contract of the body being mounted (`X-Html-Contract`). |
| `channel` | `ChannelName` |  |
| `env?` | `string` | 'local' \| 'preview' show loader notices before failed roots; anything else: console only. |
| `mode?` | `string` | The site's own mode of the page (a token such as `print`); its values belong to the site or a subpath. |
| `lang` | `string` | Content language (BCP 47). |
| `uiLang` | `string` | The app's UI language for block chrome. |
| `labels?` | `Record<string, string>` | Translated block chrome ('more' → 'Ещё'), from the app's i18n; wins over the block's own `ui`. |
| `theme` | `'light' \| 'dark'` |  |
| `reducedMotion` | `boolean` |  |
| `signal` | `AbortSignal` | Aborted on dispose; a block treats it as dispose. |
| `keyOf()` | `(root: Element) => string` |  |
| `media?()` | `(url: string, hint?: { width?: number; }) => string` |  |
| `track?()` | `(name: string, data: Record<string, unknown>) => void` |  |
| `react?` | `HostReact` | The app's React (`has('react')`). |
| `has()` | `(feature: string) => boolean` |  |

#### `HostReact`

React for blocks that render with it: the app's own `createElement` (from `react`) and `createRoot` (from `react-dom/client`), so an embedded page uses the app's React instead of loading its own. Announced by `has('react')`; blocks fall back to their own React without it.

```ts
interface HostReact
```

| Member | Type | Description |
| --- | --- | --- |
| `createElement()` | `(type: unknown, props?: Record<string, unknown> \| null, ...children: unknown[]) => unknown` |  |
| `createRoot()` | `(container: Element, options?: Record<string, unknown>) => { render(children: unknown): void; unmount(): void; }` |  |

#### `MountHandle`

What `mountBlocks` returns.

```ts
interface MountHandle
```

| Member | Type | Description |
| --- | --- | --- |
| `ready` | `Promise<MountReport[]>` | One report per root once every root settled. |
| `dispose()` | `() => void` | Idempotent. Leaves the DOM as it is (the app restores the body before a second mount). |

#### `MountReport`

The outcome of one block root.

```ts
interface MountReport
```

| Member | Type | Description |
| --- | --- | --- |
| `root?` | `Element` |  |
| `name` | `string` | The `data-component` name. |
| `key` | `string \| null` |  |
| `status` | `Exclude<MountStatus, 'loading'>` |  |
| `code?` | `string` | A failure code (`LOADER_JS_FAILED`, …) when status is 'error'. |

**Types**

#### `BlockEventDetail`

Every event carries the block's key and name besides its own fields.

```ts
type BlockEventDetail<Events extends object, T extends BlockEventType<Events>> = Events[T] & {
    key: string;
    block: string;
}
```

#### `BlockEvents`

Event details by type: the core's and an extension's (`Ext`). A type both name gets both details (`ready` of the assessment extension adds `required` and `restored`).

```ts
type BlockEvents<Ext extends object = Record<never, never>> = CoreEventDetails & Ext
```

#### `BlockEventType`

The event types of an event map (`<prefix>:<type>`); the core's by default.

```ts
type BlockEventType<Events extends object = BlockEvents> = keyof Events & string
```

#### `BlockHost`

The object an app gives every block: the core members and the members of an extension (`Ext`), for example `BlockHost<AssessmentHostMembers>` from `@foliwake/blocks-contract/assessment`. An extension's members are optional and announced by `has(name)` like the core's.

```ts
type BlockHost<Ext extends object = Record<never, never>> = HostCore & Ext
```

#### `BlockInit`

A block module's default export: initialises one root. Called once per root by the loader; a second call on the same root returns the first result. Async setup returns a promise of the handle. The loader always passes `host`: it is required here. A block may also accept being called without one (an editor, a test) and fall back to what the browser gives; the block kit's `defineBlock` does (its init takes `host?`). `contract`, optional: the major version of this contract the block was written for (the kit sets it). A loader refuses a block that declares another major (`LOADER_BLOCK_CONTRACT`); a block that declares none is accepted.

```ts
type BlockInit<Host extends BlockHost = BlockHost> = ((root: Element, host: Host, meta?: BlockMeta) => BlockHandle | Promise<BlockHandle>) & {
    readonly contract?: number;
}
```

#### `BlockLabels`

Translated block chrome by UI language, then by key (`{ en: { more: 'More' } }`): a block's `ui`.

```ts
type BlockLabels = Record<string, Record<string, string>>
```

#### `BlocksContractName`

The contract name an app config names (`app.blocks.contract`).

```ts
type BlocksContractName = `foliwake-blocks/${number}`
```

#### `ChannelName`

The site channel a page comes from.

```ts
type ChannelName = 'live' | 'preview'
```

#### `FoliwakeEvent`

A block event as an app receives it (`<prefix>:<type>` CustomEvent, bubbling from its root); a union by type.

```ts
type FoliwakeEvent<Events extends object = BlockEvents, T extends BlockEventType<Events> = BlockEventType<Events>> = {
    [K in T]: {
        type: K;
        detail: BlockEventDetail<Events, K>;
        target: Element;
        native: CustomEvent;
    };
}[T]
```

#### `KnownShell`

One of KNOWN_SHELLS.

```ts
type KnownShell = (typeof KNOWN_SHELLS)[number]
```

#### `MountStatus`

The `data-component-status` of a block root while and after it mounts, plus `disposed` in a report.

```ts
type MountStatus = 'loading' | 'ready' | 'error' | 'disposed'
```

### `@foliwake/blocks-contract/assessment`

**Interfaces**

#### `AssessmentEventDetails`

The event details the extension adds (besides `key` and `block`).

```ts
interface AssessmentEventDetails
```

| Member | Type | Description |
| --- | --- | --- |
| `ready` | `{ required: boolean; restored: boolean; }` | Added to the core `ready`: whether the block needs an answer, and whether a saved one was restored. |
| `select` | `{ selected: string[]; }` |  |
| `check` | `Answer` |  |
| `answer` | `Answer & { correct: boolean \| null; graded: 'local' \| 'host'; }` |  |
| `reset` | `{ reason: 'retry' \| 'host'; }` |  |
| `complete` | `Record<string, never>` |  |

#### `AssessmentHostMembers`

The host members of the extension; each is announced by `has(name)`.

```ts
interface AssessmentHostMembers
```

| Member | Type | Description |
| --- | --- | --- |
| `mode?` | `AssessmentMode` |  |
| `policy?` | `{ retry?: boolean; }` | `retry` undefined: the block's own default. |
| `saved?()` | `(key: string) => SavedAnswer \| null` |  |
| `check?()` | `(key: string, answer: Answer, opts: { signal: AbortSignal; }) => Promise<Verdict>` | Server-side grading (exams). |

**Types**

#### `Answer`

A block answer: the `selected` option ids, optionally `refused` ones.

```ts
type Answer = {
    selected: string[];
    refused?: string[];
}
```

#### `AssessmentEvents`

The events of an assessment block: the core's and the extension's.

```ts
type AssessmentEvents = BlockEvents<AssessmentEventDetails>
```

#### `AssessmentHost`

The host of an assessment block.

```ts
type AssessmentHost = BlockHost<AssessmentHostMembers>
```

#### `AssessmentMode`

The modes an assessment runs in: `practice` (answer and see), `exam` (graded by the host), `review` (read back).

```ts
type AssessmentMode = 'practice' | 'exam' | 'review'
```

#### `SavedAnswer`

`pending`: an answer the app has not confirmed yet (an offline outbox).

```ts
type SavedAnswer = Answer & {
    correct: boolean | null;
    verdict?: Verdict;
    pending?: boolean;
}
```

#### `Verdict`

`reveal`: sanitised HTML of fields stripped in exam mode, by field name.

```ts
type Verdict = {
    correct: boolean;
    correctIds?: string[];
    reveal?: Record<string, string>;
}
```

### `@foliwake/blocks-contract/import-map`

**Functions and components**

#### `pageImportMap()`

The text of the import map of a code release at `codeBase` (a same-origin path ending with "/"), or null without one. `<` is escaped, so the text cannot end its `<script type="importmap">`.

```ts
function pageImportMap(page: {
    codeBase: string | null;
}): string | null
```

**Returns** `string \| null`

**Constants**

#### `KIT_PATH`

Where a code release holds the block-kit, relative to its root.

```ts
const KIT_PATH = "_foliwake/block-kit.js"
```

#### `KIT_SPECIFIER`

The specifier blocks import the block-kit with: the kit's npm name, so its types need no path mapping.

```ts
const KIT_SPECIFIER = "@foliwake/block-kit"
```

### `@foliwake/blocks-contract/page`

**Interfaces**

#### `ClientSettings`

The settings a browser may know (`clientSettings(config)`); nothing else is serialised to it.

```ts
interface ClientSettings
```

| Member | Type | Description |
| --- | --- | --- |
| `site` | `string` |  |
| `proxies` | `{ code: string; media: string; pages: string \| null; }` |  |
| `blocks` | `{ contract: string; eventPrefix: string; }` |  |

#### `FoliwakePageData`

What a client component receives: serialisable, prepared per request.

```ts
interface FoliwakePageData
```

| Member | Type | Description |
| --- | --- | --- |
| `identity` | `string` | `${site}\|${channel}\|${path}\|${etag}\|${codeRelease}\|${mode}\|${digest}`: the React key of the body. `digest` is a SHA-256 prefix of the final prepared HTML and the mount-defining settings (blocks URL, contract, HTML contract, language), so any change of what is mounted gives a new identity and nothing else does. |
| `site` | `string` |  |
| `channel` | `ChannelName` |  |
| `path` | `string` |  |
| `mode` | `string \| null` | The site's mode of the page (`PrepareOptions.mode`), or null. |
| `html` | `string` | Prepared: checked, rewritten, transformed, checked again. |
| `codeRelease` | `CodeReleaseId` |  |
| `htmlContract` | `string` |  |
| `lang` | `string \| null` |  |
| `blocks` | `string[]` | Distinct `data-component` names in the body, sorted (CSS preload). |
| `blocksUrl` | `string \| null` | Same-origin URL of the blocks module, or null when the body is to stay static. |
| `codeBase` | `string \| null` | Same-origin URL prefix of the code release (`<proxies.code>[/preview]/<cd>/`), or null. |
| `contract` | `{ major: number; eventPrefix: string; }` | `foliwake-blocks/<major>` the app expects, and the event prefix it expects. |
| `preload` | `PreloadHint[]` | Same-origin preload hints of the blocks on this page (filled by the server read; empty from preparePage). |

#### `PageEnvelope`

What the origin answered for `<path>.plain.html`: the only thing an app caches.

```ts
interface PageEnvelope
```

| Member | Type | Description |
| --- | --- | --- |
| `site` | `string` |  |
| `channel` | `ChannelName` |  |
| `path` | `string` |  |
| `html` | `string` | The body as served. |
| `codeRelease` | `CodeReleaseId` | `X-Code-Release` (plain/2). |
| `htmlContract` | `string` | `X-Html-Contract`. |
| `lang` | `string \| null` | `Content-Language`. |
| `pageId` | `string \| null` | `X-Page-Id`. |
| `etag` | `string \| null` |  |
| `generation` | `string \| null` | `X-Site-Generation`. |

#### `PreloadHint`

`<link rel="modulepreload" href>` or `<link rel="preload" as="style" href>`, href on the app's code proxy.

```ts
interface PreloadHint
```

| Member | Type | Description |
| --- | --- | --- |
| `rel` | `'modulepreload' \| 'preload'` |  |
| `href` | `string` |  |
| `as?` | `'style'` |  |

#### `QueryIndex`

A page of a site's query index (rows of string columns).

```ts
interface QueryIndex<Row = Record<string, string>>
```

| Member | Type | Description |
| --- | --- | --- |
| `total` | `number` |  |
| `offset` | `number` |  |
| `limit` | `number` |  |
| `columns` | `string[]` |  |
| `data` | `Row[]` |  |

**Types**

#### `CodeReleaseId`

A code release id (`cd_` + 32–64 hex), or `local` from `foliwake dev`.

```ts
type CodeReleaseId = `cd_${string}` | 'local'
```

**Also exported** (documented where they are defined)

- from `@foliwake/blocks-contract`: `ChannelName`

### `@foliwake/blocks-contract/reserved`

**Constants**

#### `BLOCK_ATTRIBUTES`

Attributes of the HTML a loader manages (HTML contract 2).

```ts
const BLOCK_ATTRIBUTES: Readonly<{
    /** A block root: `<div data-component="<name>">` (written by the engine). */
    readonly component: "data-component";
    /** A root's state while and after it mounts: MountStatus (written by the loader). */
    readonly status: "data-component-status";
    /** A root's key, `host.keyOf(root)` (written by the loader). */
    readonly key: "data-block-key";
    /** On a block stylesheet `<link>`: the block's name (written by the loader or the app's preload). */
    readonly css: "data-component-css";
    /** On a block stylesheet `<link>`: the code release it belongs to. */
    readonly codeRelease: "data-code-release";
}>
```

#### `HOST_CONTEXT_KEY`

The context key of the host (Context Community Protocol, `context-request` events): a string, not a Symbol, so it works across copies of a library. Reserved: a later minor version lets a nested island get the host this way; today the host is the parameter of `init`.

```ts
const HOST_CONTEXT_KEY = "foliwake:host"
```

#### `KNOWN_SHELLS`

The shells this contract names: the Next and React adapters, the engine's own pages, a native app's webview, and `web-component` (reserved for a custom-element host adapter, `<foliwake-page>`; not implemented yet).

```ts
const KNOWN_SHELLS: readonly ["next", "react", "foliwake", "webview", "web-component"]
```

**Also exported** (documented where they are defined)

- from `@foliwake/blocks-contract`: `KnownShell`

<!-- apistop -->
