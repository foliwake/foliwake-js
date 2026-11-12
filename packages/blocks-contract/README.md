# @foliwake/blocks-contract

<!-- usage -->

`@foliwake/blocks-contract` holds the TypeScript types of the Foliwake blocks contract `foliwake-blocks/1`:
what a site's blocks module exports (`BLOCKS_CONTRACT`, `mountBlocks`), the host an app gives every block,
the block events, and the page types that `@foliwake/server` produces and `@foliwake/client` /
`@foliwake/react` consume. It has no runtime code. Use it when you write a blocks module or a block host by
hand, or when your own code passes pages between server and browser; the other packages re-export the types
you usually need.

| Entry | Types |
| --- | --- |
| `@foliwake/blocks-contract` | `BlocksModule`, `MountHandle`, `BlockReport`, `BlockHost`, `HostReact`, answers and verdicts, `BlockEventType`, `BlockEventDetails`, `FoliwakeEvent` |
| `@foliwake/blocks-contract/page` | `PageEnvelope` (the origin's answer, the only thing an app caches), `FoliwakePageData` (the prepared page a client component receives), `ClientSettings`, `PreloadHint`, `QueryIndex` |

A change here is a contract change: minor versions of the contract only add.

## Install

The packages are published to GitHub Packages under the `@foliwake` scope. Add an `.npmrc` to your project:

```ini
@foliwake:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN` is a GitHub personal access token (classic) with `read:packages`; fine-grained tokens do
not work with this registry. Install an exact version, the same as your other `@foliwake/*` packages; as it
holds only types, a dev dependency is enough:

```bash
pnpm add -D @foliwake/blocks-contract@0.1.0
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

### Write a blocks module

A code release's blocks module (`app.blocks.entry`, for example `scripts/blocks.js`) exports
`BLOCKS_CONTRACT` and `mountBlocks`. `mountBlocks` mounts every `[data-component]` root in the container and
returns a handle; blocks emit `<prefix>:<type>` events that bubble from their root.

```ts
// scripts/blocks.ts (compiled to scripts/blocks.js in the site's code)
import type { BlockEventDetail, BlockHost, BlockReport, BlocksModule, MountHandle } from '@foliwake/blocks-contract';

const PREFIX = 'demo';

export const BLOCKS_CONTRACT: BlocksModule['BLOCKS_CONTRACT'] = { major: 1, minor: 1, eventPrefix: PREFIX };

export function mountBlocks(container: Element, host?: BlockHost): MountHandle {
  const cleanups: (() => void)[] = [];
  const reports: BlockReport[] = [];
  for (const root of container.querySelectorAll<HTMLElement>('[data-component="choice"]')) {
    const key = host?.keyOf(root) ?? root.dataset.blockKey ?? '';
    const restored = host?.saved?.(key) ?? null;
    if (restored) root.dataset.selected = restored.selected.join(' ');
    const onClick = (event: Event) => {
      const option = (event.target as Element).closest<HTMLElement>('[data-option]');
      if (!option || host?.signal.aborted) return;
      const detail: BlockEventDetail<'answer'> = { key, block: 'choice', selected: [option.dataset.option!], correct: null, graded: 'local' };
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
this shape; the optional members it has are announced by `has(name)`.

```ts
import type { BlockHost, SavedAnswer } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';

export function makeHost(page: FoliwakePageData, signal: AbortSignal, answers: Map<string, SavedAnswer>): BlockHost {
  return {
    contract: { major: 1, minor: 1 },
    shell: 'my-app',
    htmlContract: page.htmlContract,
    channel: page.channel,
    mode: page.mode,
    lang: page.lang ?? (document.documentElement.lang || 'en'),
    uiLang: 'en',
    labels: { check: 'Check' },
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    signal,
    policy: {},
    keyOf: (root) => root.getAttribute('data-block-key') ?? '',
    saved: (key) => answers.get(key) ?? null,
    has: (feature) => feature === 'saved' || feature === 'labels' || feature === 'signal' || feature === 'channel',
  };
}
```

### Type events and pages in your own code

```ts
import type { BlockEventType, FoliwakeEvent } from '@foliwake/blocks-contract';
import type { FoliwakePageData, PageEnvelope } from '@foliwake/blocks-contract/page';

/** A handler for one event type gets that type's detail. */
export function onAnswer(event: FoliwakeEvent<'answer'>): void {
  console.log(event.detail.key, event.detail.selected, event.detail.graded);
}

export const interesting: BlockEventType[] = ['answer', 'complete'];

/** What to store in your own cache: the envelope, never the prepared page (prepare per request). */
export function cacheKey(envelope: PageEnvelope): string {
  return `${envelope.site}|${envelope.channel}|${envelope.path}|${envelope.etag ?? ''}`;
}

export const isStatic = (page: FoliwakePageData): boolean => page.blocksUrl === null;
```

## Compatibility

| | |
| --- | --- |
| Contract | `foliwake-blocks/1` (minor 1: `BLOCKS_CONTRACT.eventPrefix`, optional `host.react`) |
| TypeScript | types only; written for TypeScript 5.9 |
| Node.js | 22.22 or newer (`engines`) |

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

#### `BlockEventDetails`

The `detail` of each block event type (besides `key` and `block`).

```ts
interface BlockEventDetails
```

| Member | Type | Description |
| --- | --- | --- |
| `ready` | `{ contract: number; required: boolean; restored: boolean; }` |  |
| `select` | `{ selected: string[]; }` |  |
| `check` | `Answer` |  |
| `answer` | `Answer & { correct: boolean \| null; graded: 'local' \| 'host'; }` |  |
| `reset` | `{ reason: 'retry' \| 'host'; }` |  |
| `complete` | `Record<string, never>` |  |
| `error` | `{ code: string; message: string; recoverable: boolean; }` |  |

#### `BlockHost`

The object an app gives every block. Optional members are announced by `has(name)`.

```ts
interface BlockHost
```

| Member | Type | Description |
| --- | --- | --- |
| `contract` | `ContractVersion` |  |
| `shell` | `string` | Which app mounts ('next', 'react', 'foliwake', 'webview', …). |
| `htmlContract` | `string` | HTML contract of the body being mounted (`X-Html-Contract`). |
| `channel` | `ChannelName` |  |
| `env?` | `string` | 'local' \| 'preview' show loader notices before failed roots; anything else: console only. |
| `mode` | `BlockMode` |  |
| `lang` | `string` | Content language (BCP 47). |
| `uiLang` | `string` | The app's UI language for block chrome. |
| `labels?` | `Record<string, string>` | Translated block chrome ('check' → 'Проверить'), from the app's i18n. |
| `theme` | `'light' \| 'dark'` |  |
| `reducedMotion` | `boolean` |  |
| `signal` | `AbortSignal` | Aborted on dispose; a block treats it as dispose. |
| `policy` | `{ retry?: boolean; }` | `retry` undefined: the block's own default. |
| `keyOf()` | `(root: Element) => string` |  |
| `saved?()` | `(key: string) => SavedAnswer \| null` |  |
| `check?()` | `(key: string, answer: Answer, opts: { signal: AbortSignal; }) => Promise<Verdict>` | Server-side grading (block exams; later). |
| `media?()` | `(url: string, hint?: { width?: number; }) => string` |  |
| `track?()` | `(name: string, data: Record<string, unknown>) => void` |  |
| `react?` | `HostReact` | The app's React (optional, `has('react')`; added 2026-11-11 within minor 1, as an optional member). |
| `has()` | `(feature: string) => boolean` |  |

#### `BlockReport`

The outcome of one block root.

```ts
interface BlockReport
```

| Member | Type | Description |
| --- | --- | --- |
| `root?` | `Element` |  |
| `name` | `string` | The `data-component` name. |
| `key` | `string \| null` |  |
| `status` | `'ready' \| 'error' \| 'disposed'` |  |
| `code?` | `string` | A failure code (`LOADER_JS_FAILED`, …) when status is 'error'. |

#### `BlocksModule`

What `<code release>/<blocks.entry>` exports.

```ts
interface BlocksModule
```

| Member | Type | Description |
| --- | --- | --- |
| `BLOCKS_CONTRACT` | `ContractVersion & { eventPrefix?: string; }` | `eventPrefix` (foliwake-blocks/1.1): the prefix its blocks emit events with; absent → the app's configured one. |
| `mountBlocks()` | `(container: Element, host?: BlockHost) => MountHandle` | Mounts every `[data-component]` root inside `container`; `host` optional (the module's browser host when omitted). |

#### `ContractVersion`

The version a code release or a host speaks.

```ts
interface ContractVersion
```

| Member | Type | Description |
| --- | --- | --- |
| `major` | `1` |  |
| `minor` | `number` |  |

#### `FoliwakeEvent`

A block event as an app receives it (`<prefix>:<type>` CustomEvent, bubbling from the block root).

```ts
interface FoliwakeEvent<T extends BlockEventType = BlockEventType>
```

| Member | Type | Description |
| --- | --- | --- |
| `type` | `T` |  |
| `detail` | `BlockEventDetail<T>` |  |
| `target` | `Element` |  |
| `native` | `CustomEvent` |  |

#### `HostReact`

React for blocks that render with it (block-kit `mountReact`): the app's own `createElement` (from `react`) and `createRoot` (from `react-dom/client`), so an embedded page uses the app's React instead of loading its own. Announced by `has('react')`; blocks fall back to their own React without it.

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
| `ready` | `Promise<BlockReport[]>` | One report per root once every root settled. |
| `dispose()` | `() => void` | Idempotent. Leaves the DOM as it is (the app restores the body before a second mount). |

**Types**

#### `Answer`

A block answer: the `selected` option ids, optionally `refused` ones.

```ts
type Answer = {
    selected: string[];
    refused?: string[];
}
```

#### `BlockEventDetail`

Every event carries the block's key and name besides its own fields.

```ts
type BlockEventDetail<T extends BlockEventType> = BlockEventDetails[T] & {
    key: string;
    block: string;
}
```

#### `BlockEventType`

The block event types (`<prefix>:<type>`).

```ts
type BlockEventType = 'ready' | 'select' | 'check' | 'answer' | 'reset' | 'complete' | 'error'
```

#### `BlockEventTypes`

Every event type, in a fixed order.

```ts
type BlockEventTypes = readonly BlockEventType[]
```

#### `BlockMode`

The mode blocks run in.

```ts
type BlockMode = 'practice' | 'exam' | 'review'
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
| `mode` | `BlockMode` |  |
| `html` | `string` | Prepared: checked, rewritten, transformed, checked again. |
| `codeRelease` | `CodeReleaseId \| null` |  |
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
| `codeRelease` | `CodeReleaseId \| null` | `X-Code-Release` (plain/2); null from a plain/1 origin → the body is shown static. |
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

<!-- apistop -->
