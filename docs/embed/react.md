# Embed pages in another React app

`@foliwake/react` has no Next.js dependency: `<FoliwakePage>` works in any React 19 app.
The page comes from your own server, prepared with `@foliwake/server`.
This guide uses plain Web `Request`/`Response` handlers; mount them in Vite's server, Hono, Remix, Express with
Web adapters or a worker.

```sh
npm install @foliwake/react@0.3.0 @foliwake/server@0.3.0
```

You also need `foliwake.remote.json` in the server's working folder;
[Embed pages in a Next.js app](/embed/next#step-2-the-config-file) describes every key.

## On the server: a page endpoint

Cache only the envelope (what the origin answered) and prepare it on every request.

```ts
// server/page.ts
import { loadFoliwakeConfig } from '@foliwake/server/config';
import { createOriginClient } from '@foliwake/server/origin';
import { FoliwakePageError, preparePage, readEnvelope, type PageEnvelope } from '@foliwake/server/page';
import { preloadHints } from '@foliwake/server/preload';

const config = await loadFoliwakeConfig(); // FOLIWAKE_REMOTE, else ./foliwake.remote.json
const client = createOriginClient(config, process.env);
const cache = new Map<string, { at: number; envelope: PageEnvelope }>();
const maxAge = (config.app?.revalidate ?? 300) * 1000;

async function liveEnvelope(path: string): Promise<PageEnvelope> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < maxAge) return hit.envelope;
  const envelope = await readEnvelope(config, client, config.site, 'live', path);
  cache.set(path, { at: Date.now(), envelope });
  return envelope;
}

/** GET /api/page?path=/lessons/a */
export async function pageEndpoint(request: Request): Promise<Response> {
  const path = new URL(request.url).searchParams.get('path') ?? '/';
  try {
    const page = preparePage(config, await liveEnvelope(path), { rewriteLink: (href) => `/learn${href}` });
    page.preload = await preloadHints(config, client, page);
    return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const missing = error instanceof FoliwakePageError && (error.kind === 'not_found' || error.kind === 'not_allowed');
    if (missing) return new Response(null, { status: 404 });
    throw error;
  }
}
```

## On the server: the code and media proxies

```ts
// server/proxies.ts
import { loadFoliwakeConfig } from '@foliwake/server/config';
import { codeHandler, mediaHandler } from '@foliwake/server/handlers';
import { createOriginClient } from '@foliwake/server/origin';

const config = await loadFoliwakeConfig();
const client = createOriginClient(config, process.env);
const code = codeHandler(config, client, { authorizePreview: false });
const media = mediaHandler(config, client, { authorizePreview: false });
const prefixes = config.app?.proxies ?? { code: '/foliwake-code', media: '/foliwake-media' };

/** Routes requests under /foliwake-code/ and /foliwake-media/ to the handlers; null for anything else. */
export async function proxies(request: Request): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const segments = (prefix: string) => pathname.slice(prefix.length + 1).split('/').filter(Boolean);
  if (pathname.startsWith(`${prefixes.code}/`)) return code(request, { path: segments(prefixes.code) });
  if (pathname.startsWith(`${prefixes.media}/`)) return media(request, { path: segments(prefixes.media) });
  return null;
}
```

Set a Content-Security-Policy that fits with `foliwakeCsp` from `@foliwake/server/csp`.

## In the browser

```tsx
// src/lesson.tsx
import { useEffect, useState } from 'react';
import { FoliwakePage, type FoliwakePageData, type FoliwakePageStatus } from '@foliwake/react';

export function Lesson({ path }: { path: string }) {
  const [page, setPage] = useState<FoliwakePageData | null>(null);
  const [status, setStatus] = useState<FoliwakePageStatus | 'idle'>('idle');
  useEffect(() => {
    const request = new AbortController();
    fetch(`/api/page?path=${encodeURIComponent(path)}`, { signal: request.signal })
      .then((response) => response.json() as Promise<FoliwakePageData>)
      .then(setPage, () => {});
    return () => request.abort();
  }, [path]);
  if (!page) return <p>Loading…</p>;
  return (
    <>
      <FoliwakePage page={page} as="article" onStatus={setStatus} />
      <p role="status">Blocks: {status}</p>
    </>
  );
}
```

With server rendering, render `<FoliwakePage>` on the server too:
the body is HTML before any JavaScript, and blocks mount in the browser.

The [`@foliwake/react` reference](/reference/packages/react) shows the host with saved answers,
typed event handlers with `useFoliwakeEvents`, and status and error handling.
