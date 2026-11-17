# Other frameworks, or none

All browser logic lives in `@foliwake/client`, which has no framework dependency.
It inserts or keeps the body, imports the code release's blocks module, builds the host, routes events,
guards every async step against dispose, and counts block stylesheets per code release.
`@foliwake/react` is a thin wrapper around it.

The server side is the same as for React: a page endpoint and the proxies with `@foliwake/server`
(see [Embed pages in another React app](/embed/react)).

```sh
npm install @foliwake/client@0.3.0 @foliwake/server@0.3.0
```

## Plain DOM

```ts
import { mountFoliwakePage, type FoliwakePageData } from '@foliwake/client';

const response = await fetch('/api/page?path=/lessons/a');
const page = (await response.json()) as FoliwakePageData;

const mount = mountFoliwakePage(document.querySelector<HTMLElement>('#lesson')!, {
  page,
  host: { labels: { check: 'Check' } },
  onEvent: (event) => console.log(event.type, event.detail.key),
  onStatus: (status) => console.log('blocks', status),
  stylesheets: true, // the blocks' stylesheets in <head>, removed with the last mount of the release
});

// Later:
mount.update({ host: { labels: { check: 'Prüfen' } } }); // new host or callbacks, no remount
mount.dispose();                                         // idempotent; no callback runs after it
```

## Write an adapter

An adapter maps its framework's lifecycle onto three calls:

| When | Call |
| --- | --- |
| the element is in the document | `mountFoliwakePage(element, options)` |
| props change | `mount.update(options)`: callbacks and host are read at call time, so it never remounts |
| the element goes away | `mount.dispose()` |

Rules it can rely on:

- With the default `body: 'auto'`, a body the server already rendered into the element is kept,
  and an empty element gets `page.html`.
- Remount only when `pageIdentity(page)` changes: use it as the framework's key,
  or pass the new `page` to `update`, which disposes and mounts again on the pristine body.
- Never let the framework re-render the body element's children: the blocks own them.
- `pageStylesheets(page)` lists the stylesheet links to render with the body, or pass `stylesheets: true`.

### A custom element

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
    if (!this.#page || this.#mount) return;
    this.#mount = mountFoliwakePage(this, { page: this.#page, shell: 'web-component', stylesheets: true });
  }

  disconnectedCallback() {
    this.#mount?.dispose();
    this.#mount = null;
  }
}

customElements.define('foliwake-page', FoliwakePageElement);
```

### A Vue 3 component

A sketch, not a published package:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { mountFoliwakePage } from '@foliwake/client';
import type { FoliwakeEvent, FoliwakeMount, FoliwakePageData, HostInit } from '@foliwake/client';

const props = defineProps<{ page: FoliwakePageData; host?: HostInit }>();
const emit = defineEmits<{ event: [FoliwakeEvent]; status: [string] }>();
const el = ref<HTMLElement>();
let mount: FoliwakeMount | undefined;
const callbacks = () => ({
  host: props.host,
  onEvent: (event: FoliwakeEvent) => emit('event', event),
  onStatus: (status: string) => emit('status', status),
});

onMounted(() => { mount = mountFoliwakePage(el.value!, { page: props.page, shell: 'vue', ...callbacks() }); });
watch(() => props.host, () => mount?.update(callbacks()), { deep: true });
watch(() => props.page, (page) => mount?.update({ page })); // another identity remounts on the pristine body
onBeforeUnmount(() => mount?.dispose());
</script>

<template>
  <!-- v-once: Vue renders the body once (SSR included) and never patches it; the blocks own the children. -->
  <div ref="el" v-once data-foliwake-body v-html="page.html" />
</template>
```

A Svelte action or an Astro island has the same shape:
create on connect, `update` on changes, `dispose` on disconnect.

## Events outside the mount

`subscribeBlockEvents` routes `<prefix>:<type>` events under any element to typed handlers,
for example to a progress bar next to the page:

```ts
import { subscribeBlockEvents } from '@foliwake/client';
import type { AssessmentEvents } from '@foliwake/blocks-contract/assessment';

const stop = subscribeBlockEvents<AssessmentEvents>(
  document.querySelector('#lesson')!,
  {
    answer: (event) => console.log(event.detail.key, event.detail.correct),
    complete: (event) => console.log('done:', event.detail.block),
  },
  { prefix: 'demo', types: ['answer', 'complete'] },
);
// later: stop()
```

The prefix is the config's `app.blocks.eventPrefix`; `clientSettings(config)` on the server gives it to the browser.
