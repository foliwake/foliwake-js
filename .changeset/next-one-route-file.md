---
'@foliwake/next': minor
---

`@foliwake/next/handler`: one route file, `app/foliwake/[...path]/route.ts` with
`export { GET, HEAD, POST } from '@foliwake/next/handler'`, serves the code and media proxies, the hook (secret in
`FOLIWAKE_HOOK_SECRET`, Next cache tags expired as by `foliwakeRevalidateHandler`) and `/foliwake/health`.
Preview is off; `createFoliwakeHandler({ authorizePreview, hook, base })` customises it. It wraps
`createFoliwakeHandler` of `@foliwake/server/handler`. `codeRoute`, `mediaRoute` and `foliwakeRevalidateHandler`
stay for the manual setup.
