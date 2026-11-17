<!--
  A diagram from public/diagrams (written by scripts/diagrams.mjs), in the version that fits:
  the wide or the phone layout (by screen width), light or dark (by the site theme, which CSS follows;
  the hidden picture is not shown and not read out). Usage in Markdown: <Diagram name="embedding" alt="…" />
-->
<script setup>
import { withBase } from 'vitepress';

const props = defineProps({
  name: { type: String, required: true },
  alt: { type: String, required: true },
});

/** Below this width the phone layout is shown. */
const PHONE = '(max-width: 639px)';

const file = (suffix) => withBase(`/diagrams/${props.name}${suffix}.svg`);
</script>

<template>
  <figure class="diagram">
    <picture class="diagram-light">
      <source :media="PHONE" :srcset="file('-phone')" />
      <img :src="file('')" :alt="alt" />
    </picture>
    <picture class="diagram-dark">
      <source :media="PHONE" :srcset="file('-phone-dark')" />
      <img :src="file('-dark')" :alt="alt" />
    </picture>
  </figure>
</template>
