---
'@foliwake/cli': minor
---

`foliwake dev --remote [preview|live]` (and `--remote-url`) without the engine: the deployed site's pages with
this checkout's `components/`, `scripts/` and `styles/`, the block kit from `@foliwake/block-kit`, `--watch`
reloads with the checks of `@foliwake/site-check`. The block catalog (`/_dev/blocks`) answers that it needs the
engine or the open block renderer.
