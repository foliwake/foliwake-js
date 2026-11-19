---
'@foliwake/next': patch
---

`@foliwake/next` ships the config schema as `schemas/remote-2.schema.json`, so `"$schema"` in
`foliwake.remote.json` resolves when `@foliwake/next` is the only direct dependency (pnpm). The guide installs one
package, its preview example uses the user name `preview` with the site's preview token, and it explains
`app.proxies.pages: null`.
