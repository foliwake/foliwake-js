# @foliwake/react

Show a prepared Foliwake page in any React 19 app and mount its blocks from the page's own code release.

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

Also exported: `useFoliwakeEvents(ref, handlers, { prefix })`, `createHost(init, { signal, page })`,
`FoliwakeProvider` / `useFoliwakeSettings`, and the contract types.

Invariants: the page's identity (site, channel, path, ETag, code release, mode and a digest of the final
prepared body and its mount settings) is the only thing that remounts. Callbacks and host data are read at call time. Every async step is abort-guarded, and dispose is
idempotent with no event after it. A second mount on the same element starts from the pristine body
(StrictMode). Block stylesheets are counted per code release. The module is imported at run time from a
same-origin URL (`import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)`). The package never
fetches from a Foliwake origin. Apache-2.0.
