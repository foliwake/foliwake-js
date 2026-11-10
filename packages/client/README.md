# @foliwake/client

Show a prepared Foliwake page in any browser app and mount its blocks from the page's own code release.
DOM only, no framework. `@foliwake/react` is a thin wrapper around it, and so is any other adapter (Vue,
Svelte, Astro, a web component).

```js
import { mountFoliwakePage } from '@foliwake/client';

const mount = mountFoliwakePage(document.querySelector('#lesson'), {
  page,                                         // FoliwakePageData from the server (@foliwake/server preparePage)
  host: { shell: 'web', labels: { check: 'Check' }, saved: (key) => answers[key] ?? null },
  onEvent: (e) => e.type === 'answer' && save(e.detail.key, e.detail.selected),
  onStatus: (status, reports) => …,             // mounting | ready | partial | static | error
  onError: ({ code, message }) => …,            // NO_CODE_RELEASE, BLOCKS_CONTRACT_UNSUPPORTED, BLOCKS_MODULE_FAILED, …
  onMount: (container, handle) => …,            // imperative app logic (slides, focus)
  stylesheets: true,                            // add the blocks' <link rel="stylesheet"> to <head> (default false)
  signal,                                       // optional: aborting it disposes
});
mount.update({ host: { …newer data } });        // latest wins, no remount
mount.update({ page: nextPage });               // another page.identity: dispose, then mount on the pristine body
mount.dispose();                                // idempotent; no callback after it
```

Options: `body` decides what happens to the element's content before the blocks mount. With `'auto'` (the
default), `page.html` is inserted when the element is empty or was mounted before, and server-rendered HTML
is kept on the first mount. `'insert'` always inserts it. `'keep'` never touches it. `shell` is the host's
shell when `host` names none (default `'web'`). `requireBlocks` makes a static body `error`. `blocks` replaces
the runtime import (build-time mode, later).

Lifecycle hooks (an extension point; the full hooks contract comes later): `hooks: { site?, template? }`, each
`{ beforeBlocks?, afterFirstSection?, lazy?, delayed? }` of `({ phase, container, page, signal }) => void | Promise`.
Phases run in that order; in each phase the site's hook runs before the template's, and a returned promise is
awaited (raced against the mount's `signal`, so a slow hook never holds up dispose or the next mount). In 0.1: `beforeBlocks` after the module loaded and passed the contract check, before `mountBlocks`;
`afterFirstSection` right after `mountBlocks` (a body is one section); `lazy` once the blocks are ready;
`delayed` after that, on a later task. A failing hook is reported (`onError` `HOOK_FAILED`) and the mount goes
on. After dispose no further hook starts, but a hook that is already running is not stopped: cancellation is
cooperative. A hook must check `signal.aborted` after every `await` and stop there, and remove what it added
itself (listeners, timers, nodes): after dispose the same element may already hold the next page's mount. `<FoliwakePage hooks={…}>` passes them through.

Also exported: `createHost(init, { signal, page, shell })`, `subscribeBlockEvents(element, handlers, { prefix })`,
`listenBlockEvents`, `BLOCK_EVENT_TYPES`, `pageIdentity(page)` (the key an adapter remounts on),
`pageStylesheets(page)` (the links an adapter renders with the body), `importBlocksModule(url)`,
`acquireCss` / `cssMounts`, and the contract types.

Invariants: the page's identity (`page.identity`, prepared by `@foliwake/server`) is the only thing that
remounts: the same identity never remounts, another one (a new body, code release, channel or mode) disposes
and mounts again. Callbacks and host data are read at call time. Every async step is abort-guarded, and dispose is
idempotent with no event after it. Mount, dispose and mount again on the same element starts from the
pristine body. Block stylesheets are counted per code release. The module is imported at run time from a
same-origin URL (`import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ url)`).
The package never fetches from a Foliwake origin. Apache-2.0.

Writing an adapter for another framework: see the guide, "Other frameworks"
(`website/guide/embed-in-react.md`).
