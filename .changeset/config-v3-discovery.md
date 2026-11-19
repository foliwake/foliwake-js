---
'@foliwake/server': minor
'@foliwake/next': minor
---

Configure an app by one address. `@foliwake/server/discovery` reads a site's `/.well-known/foliwake.json`
(no redirects, 5 s, one retry, at most 16 KiB; `live.url` must be the origin it was read from; the discovery format
and the plain contract are checked). `@foliwake/server/resolve` builds the app config from `FOLIWAKE_URL` and the
optional `foliwake.remote.json` version 3 (overrides only: pages, revalidate, proxies, media, blocks, auth by
variable name; schema `schemas/remote-3.schema.json`, also shipped in `@foliwake/next`). Defaults: pages `/**`
(required explicitly when live uses a service token), proxies `/foliwake/code` and `/foliwake/media`, preview
read with Basic `preview` and `FOLIWAKE_PREVIEW_TOKEN`. A version 2 file without `FOLIWAKE_URL` works unchanged.
`FoliwakeAppConfig.version` is now `2 | 3` and `app.blocks` has `fromRelease`. The compatibility metadata is
`remoteConfig: 3, discovery: 1`.
