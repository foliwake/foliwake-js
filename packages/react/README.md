# @foliwake/react

Show a prepared Foliwake page in any React 19 app and mount its blocks from the page's own code release.
A thin wrapper of [`@foliwake/client`](../client/README.md), which holds the lifecycle; this package adds the
component, the hook and the settings context.

```tsx
'use client';
import { FoliwakePage } from '@foliwake/react';

<FoliwakePage
  page={page}                                   // FoliwakePageData from the server (@foliwake/server preparePage)
  host={{ shell: 'react', labels: { check: 'Check' }, saved: (key) => answers[key] ?? null }}
  onEvent={(e) => e.type === 'answer' && save(e.detail.key, e.detail.selected)}
  onStatus={(status, reports) => …}            // mounting | ready | partial | static | error
  onError={({ code, message }) => …}           // NO_CODE_RELEASE, BLOCKS_CONTRACT_UNSUPPORTED, BLOCKS_MODULE_FAILED, EVENT_PREFIX_MISMATCH, …
  onMount={(container, handle) => …}           // imperative app logic (slides, focus)
/>
```

Also exported: `useFoliwakeEvents(ref, handlers, { prefix })`, `FoliwakeProvider` / `useFoliwakeSettings`, and,
re-exported from `@foliwake/client`, `createHost(init, { signal, page })` (default shell `'react'`),
`listenBlockEvents`, `BLOCK_EVENT_TYPES`, `cssMounts` and the contract types.

Invariants (held by `@foliwake/client`'s `mountFoliwakePage`; the component passes it the body element and
the latest props on every render): the page's identity (site, channel, path, ETag, code release, mode) is the
React key and the only thing that remounts. Callbacks and host data are read at call time. Every async step is abort-guarded, and dispose is
idempotent with no event after it. A second mount on the same element starts from the pristine body
(StrictMode). Block stylesheets are counted per code release. The module is imported at run time from a
same-origin URL (`import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)`). The package never
fetches from a Foliwake origin. Apache-2.0.
