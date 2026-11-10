# @foliwake/next

Next.js (App Router, 16.2+, `cacheComponents`) adapter for Foliwake pages.

| Entry | Exports |
|---|---|
| `@foliwake/next/config` | `withFoliwake(nextConfig, { configFile?, csp? })`, `foliwakeCspHeader()` |
| `@foliwake/next` (server-only) | `FoliwakeServerPage`, `readPage`, `readEnvelopeCached`, `foliwakeConfig`, `originClient`, `foliwakeTags`, `preloadHints`, `emitPreloadHints`, `readEnvelope`, `preparePage` |
| `@foliwake/next/cache` | `readEnvelopeCached(path)` (`'use cache'`, live only, tags `foliwake:<site>:live:page:<path>`) |
| `@foliwake/next/routes` | `codeRoute({ authorizePreview })`, `mediaRoute({ authorizePreview })` → `{ GET, HEAD }` |
| `@foliwake/next/client` | everything of `@foliwake/react` (`'use client'`) |

```ts
// next.config.ts
import { withFoliwake } from '@foliwake/next/config';
export default withFoliwake({ cacheComponents: true }, { csp: { reportUri: '/csp-report' } });
```

```tsx
// app/pages/[[...path]]/page.tsx
<Suspense fallback={null}>
  <FoliwakeServerPage path="/lessons/a" channel="live" render={(page) => <PageView page={page} />} />
</Suspense>
```

CSP: strategy A (`script-src 'self' 'unsafe-inline'`), measured with zero violations under partial
prerendering. A nonce policy is not supported (it breaks on Next 16.4). Step by step:
[Embed Foliwake pages in a React or Next app](https://github.com/adjioev/foliwake/blob/main/website/guide/embed-in-react.md);
working example: `examples/next-app`. Apache-2.0.
