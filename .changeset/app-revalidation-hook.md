---
'@foliwake/server': minor
'@foliwake/next': minor
---

Apps can be told when the live site changes. `@foliwake/server/hook` verifies the signed hook a Foliwake server
sends once a change is live and the caches in front of the origin serve it (`verifyFoliwakeSignature`,
`parseFoliwakeHook`, `signFoliwakeHook` for tests, payload types). `@foliwake/next/revalidate` adds
`foliwakeRevalidateHandler({ secretEnv })`, a route handler that expires the live tag of every changed path, or
of the whole site when every page changed, with `{ expire: 0 }` by default (`mode: 'max'` for background
refresh), reads up to 20 changed pages again after answering (`warm`), accepts a previous secret while it is
rotated (`previousSecretEnv`) and calls `onDelivery(payload)`.
