---
'@foliwake/site-check': minor
---

`site.yaml` may name the blocks module an embedding app loads: `blocks: { entry, contract, eventPrefix }`. A site
whose `components/components.json` is generated from its block folders gets it in the generated descriptor (the
engine sends it as `X-Foliwake-Blocks`); the entry must exist. With a hand-written descriptor the key belongs there,
and naming it in both places is `SITE_CONFIG_INVALID`.
