# @foliwake/react

<!-- usage -->

`@foliwake/react` shows a prepared Foliwake page in a React 19 app: `<FoliwakePage>` renders the page body
(also on the server, so it is readable before any JavaScript) and mounts the page's blocks from the page's
own code release. Use it in any React app; in a Next.js App Router app use `@foliwake/next`, which adds the
server side (reading, caching, proxies, CSP) and re-exports this package from `@foliwake/next/client`. It is a
thin wrapper of `@foliwake/client`, which holds the lifecycle.

The page comes from your server as a `FoliwakePageData` object (`preparePage` of `@foliwake/server`, or
`readPage` / `<FoliwakeServerPage>` of `@foliwake/next`). This package never talks to a Foliwake origin.

## Install

The packages are published on npm (npmjs.com) under the `@foliwake` scope; no registry setup or token is
needed. Install an exact version, and use the same version for every `@foliwake/*` package:

```bash
pnpm add @foliwake/react@0.3.0 @foliwake/server@0.3.0
```

## Minimal example

```tsx
'use client';
import { FoliwakePage, type FoliwakePageData } from '@foliwake/react';

export function Lesson({ page }: { page: FoliwakePageData }) {
  return <FoliwakePage page={page} as="article" className="lesson" />;
}
```

`<FoliwakePage>` remounts only when `page.identity` changes (a new body, code release, channel or mode). New
callbacks and host data on later renders take effect without a remount. StrictMode double mounts are
handled.

## Examples

### Pass a host with saved answers, and save new ones

The host is your app's side of the blocks contract. `labels` translate block chrome, `track` takes analytics,
and `react` lets blocks that render with React use your app's React instead of loading their own. A site with
exercises adds the assessment extension (`@foliwake/blocks-contract/assessment`): `saved(key)` restores an
answer, and its event types (named in `events`) report new ones.

```tsx
'use client';
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FoliwakePage, type FoliwakeEvent, type FoliwakePageData } from '@foliwake/react';
import type { AssessmentEvents, AssessmentHostMembers, SavedAnswer } from '@foliwake/blocks-contract/assessment';

const ASSESSMENT_EVENTS = ['select', 'check', 'answer', 'reset', 'complete'] as const;

export function Lesson({ page, initial }: { page: FoliwakePageData; initial: Record<string, SavedAnswer> }) {
  const [answers, setAnswers] = useState(initial);
  const onEvent = (event: FoliwakeEvent<AssessmentEvents>) => {
    if (event.type !== 'answer') return;
    const { key, selected, correct } = event.detail;
    setAnswers((all) => ({ ...all, [key]: { selected, correct } }));
    void fetch('/api/answers', { method: 'POST', body: JSON.stringify({ key, selected, correct }) });
  };
  return (
    <FoliwakePage<AssessmentHostMembers, AssessmentEvents>
      page={page}
      host={{
        mode: 'practice',
        labels: { check: 'Check' },
        saved: (key) => answers[key] ?? null,
        react: { createElement, createRoot },
      }}
      events={ASSESSMENT_EVENTS}
      onEvent={onEvent}
    />
  );
}
```

### Listen to block events with typed handlers

`useFoliwakeEvents` subscribes to the block events under an element, one typed handler per event type. The
handlers are read at event time, so they can use the latest state without re-subscribing. The prefix is
`app.blocks.eventPrefix` of the config; pass the settings from the server with `FoliwakeProvider`
(`clientSettings(config)` of `@foliwake/server/config` is the safe browser projection).

```tsx
'use client';
import { useRef, useState } from 'react';
import { FoliwakePage, useFoliwakeEvents, useFoliwakeSettings, type FoliwakePageData } from '@foliwake/react';
import type { AssessmentEvents } from '@foliwake/blocks-contract/assessment';

export function LessonWithProgress({ page }: { page: FoliwakePageData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState<string[]>([]);
  const prefix = useFoliwakeSettings()?.blocks.eventPrefix ?? page.contract.eventPrefix;
  useFoliwakeEvents<AssessmentEvents>(ref, {
    answer: (event) => console.log(event.detail.key, event.detail.correct ? 'correct' : 'wrong'),
    complete: (event) => setDone((keys) => [...keys, event.detail.key]),
  }, { prefix, types: ['answer', 'complete'] });
  return (
    <div ref={ref}>
      <p>{done.length} blocks completed</p>
      <FoliwakePage page={page} />
    </div>
  );
}
```

`FoliwakeProvider` goes around the part of the tree that needs the settings:
`<FoliwakeProvider settings={settings}>…</FoliwakeProvider>`, with `settings` computed on the server.

### Show status and errors

```tsx
'use client';
import { useState } from 'react';
import { FoliwakePage, type FoliwakePageData, type FoliwakePageStatus } from '@foliwake/react';

export function LessonWithStatus({ page }: { page: FoliwakePageData }) {
  const [status, setStatus] = useState<FoliwakePageStatus | 'idle'>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <FoliwakePage
        page={page}
        requireBlocks
        onStatus={setStatus}
        onError={({ code, message }) => setProblem(`${code}: ${message}`)}
        onMount={(container) => container.querySelector<HTMLElement>('[data-component]')?.focus()}
      />
      <p role="status">Blocks: {status}</p>
      {problem && <p role="alert">{problem}</p>}
    </>
  );
}
```

Statuses: `mounting`, then `ready`, `partial` (some blocks failed) or `static` (shown without blocks; with
`requireBlocks` that is `error`). Error codes include `NO_BLOCKS_ENTRY`, `BLOCKS_CONTRACT_UNSUPPORTED`,
`BLOCKS_MODULE_FAILED` and `EVENT_PREFIX_MISMATCH`.

## Compatibility

| | |
| --- | --- |
| React | 19.2 or newer (peer `^19.2.0`; tested with 19.3.0) |
| Browsers | ES2022 with dynamic `import()` (tested in Chrome) |
| Blocks contract | `foliwake-blocks/2` |
| Page data | from `@foliwake/server` or `@foliwake/next` of the same version |

The package is marked `'use client'`. Rendering on the server is safe: the body is rendered as HTML and
blocks mount only in the browser.

Changes per version, breaking ones marked: `CHANGELOG.md` in the package
(`node_modules/@foliwake/react/CHANGELOG.md`).

## Good to know

- `preloadCss` (default true) renders `<link rel="stylesheet">` for `components/<name>/<name>.css` of every
  block on the page. It does not read the release's `components/components.json`, so a block without a
  stylesheet gets a link that answers 404 (harmless, but visible in the network panel). To avoid that, pass
  `preloadCss={false}` and render the stylesheet hints of `page.preload` (entries with `as: 'style'`, filled
  by `readPage` of `@foliwake/next` or `preloadHints` of `@foliwake/server`), which list only existing files.
- React does not re-render the body element's children after the first render: the blocks own them.

## See also

- [`@foliwake/next`](https://www.npmjs.com/package/@foliwake/next): the Next.js App Router adapter.
- [`@foliwake/server`](https://www.npmjs.com/package/@foliwake/server): read and prepare the page on your
  server.
- [`@foliwake/client`](https://www.npmjs.com/package/@foliwake/client): the lifecycle this package wraps.

License: Apache-2.0.

<!-- usagestop -->

## API

<!-- api -->

<!-- Generated by `pnpm packages:reference` from the type declarations; do not edit by hand. -->

### `@foliwake/react`

**Functions and components**

#### `createHost()`

`createHost` of `@foliwake/client` with the shell `'react'` when the app names none.

```ts
function createHost<Ext extends object = Record<never, never>>(init: HostInit<Ext> | (() => HostInit<Ext>), base: {
    signal: AbortSignal;
    page: FoliwakePageData;
}): CreatedHost<Ext>
```

**Returns** `CreatedHost<Ext>`

#### `FoliwakePage()`

Shows a prepared Foliwake page and mounts its blocks. Remounts only when `page.identity` changes.

```ts
function FoliwakePage<Ext extends object = Record<never, never>, Events extends CoreEventDetails = BlockEvents>(props: FoliwakePageProps<Ext, Events>): ReactNode
```

**Returns** `ReactNode`

#### `FoliwakeProvider()`

Makes `clientSettings(config)` available to client code (useFoliwakeSettings).

```ts
function FoliwakeProvider(props: {
    settings: ClientSettings;
    children?: ReactNode;
}): ReactNode
```

**Returns** `ReactNode`

#### `useFoliwakeEvents()`

Block events under `target` to typed handlers; handlers are read at event time (latest wins, no re-subscribe). `opts.types`: event types besides the core `ready` and `error`.

```ts
function useFoliwakeEvents<Events extends CoreEventDetails = BlockEvents, T extends BlockEventType<Events> = BlockEventType<Events>>(target: RefObject<Element | null>, handlers: FoliwakeEventHandlers<Events>, opts: {
    prefix: string;
    types?: readonly T[];
}): void
```

**Returns** `void`

#### `useFoliwakeSettings()`

The settings given to the nearest `FoliwakeProvider`, or null outside one.

```ts
function useFoliwakeSettings(): ClientSettings | null
```

**Returns** `ClientSettings \| null`

**Interfaces**

#### `FoliwakePageProps`

Props of `<FoliwakePage>`: the page, the mount callbacks of `@foliwake/client`, and how to render the body.

```ts
interface FoliwakePageProps<Ext extends object = Record<never, never>, Events extends CoreEventDetails = BlockEvents> extends FoliwakeMountCallbacks<Ext, Events>
```

| Member | Type | Description |
| --- | --- | --- |
| `page` | `FoliwakePageData` | The prepared page from the server; its `identity` is the component's key. |
| `blocks?` | `() => Promise<BlocksModule>` | Build-time mode (later): the blocks module from the app's bundle instead of the code release. |
| `preloadCss?` | `boolean` | Render &lt;link rel="stylesheet"&gt; for the body's blocks with the body (default true). |
| `as?` | `'div' \| 'article' \| 'main' \| 'section'` | The body element's tag (default `div`). |
| `className?` | `string` | The body element's class. |
| `nonce?` | `string` | The document's CSP nonce (CSP strategy `nonce`): set on the import map the mount adds for the page's code release. |

**Also exported** (documented where they are defined)

- from `@foliwake/blocks-contract`: `BlockEventDetail`, `BlockEvents`, `BlockEventType`, `BlockHost`, `BlocksModule`, `ContractVersion`, `FoliwakeEvent`, `HostCore`, `MountHandle`, `MountReport`, `MountStatus`
- from `@foliwake/blocks-contract/page`: `ClientSettings`, `FoliwakePageData`
- from `@foliwake/client`: `BLOCK_EVENT_TYPES`, `CreatedHost`, `cssMounts`, `FoliwakeEventHandlers`, `FoliwakeHooks`, `FoliwakePageError`, `FoliwakePageStatus`, `HOST_CONTRACT_MINOR`, `HostInit`, `listenBlockEvents`

<!-- apistop -->
