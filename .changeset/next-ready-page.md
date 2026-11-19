---
'@foliwake/next': minor
---

`@foliwake/next/page`: a ready page route. `app/[...path]/page.tsx` with
`export { default, generateMetadata } from '@foliwake/next/page'` shows live site pages at the app's root (the
app's own routes win; `/` stays the app's): Suspense, the page read and prepared, preload hints and import map,
`<FoliwakePage as="article">`, `notFound()` for a missing page. `generateMetadata` gives the title (the first `<h1>`)
and `noindex` for preview. `createFoliwakePage({ render, prepare, channel, authorize, mount, fallback })`
customises it; a preview route requires `authorize`.
