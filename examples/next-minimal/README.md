# Next.js minimal example

The smallest Next.js App Router app that shows Foliwake pages. Its Foliwake files are exactly what
`npx @foliwake/next init` writes (a test keeps them so):

| File | What |
| --- | --- |
| `next.config.ts` | `withFoliwake({ cacheComponents: true })` |
| `app/foliwake/[...path]/route.ts` | code, media, hook and health routes |
| `app/[...path]/page.tsx` | the site's pages; `app/page.tsx` stays the app's |

Run it against a site:

```sh
FOLIWAKE_URL=https://my-site.example.org pnpm --filter next-minimal-example dev
```

`test/next-example.test.js` builds and starts it against a stub site when `FOLIWAKE_NEXT_SMOKE=1` is set.
