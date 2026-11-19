---
'@foliwake/server': minor
'@foliwake/next': patch
---

`@foliwake/server/handler`: `createFoliwakeHandler()` serves every Foliwake route of an app as one
`(request: Request) => Promise<Response>` on the Web Fetch API, for any framework: the code and media proxies under
the config's prefixes (`/foliwake/code`, `/foliwake/media` by default), `POST /foliwake/hook` (secret in
`FOLIWAKE_HOOK_SECRET`, `onDelivery` for the app's caches) and `GET /foliwake/health`. Preview is off unless
`authorizePreview` is given. The config is read on the first request (`FOLIWAKE_URL`), or passed as `config`.
The hook endpoint core moved from `@foliwake/next` to `@foliwake/server/hook-endpoint` (`createHookEndpoint`);
a ping of the Next route still answers `@foliwake/next/<version>`. New guide: "Any framework: one handler".
