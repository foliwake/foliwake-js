# @foliwake/next

<!-- usage -->

`@foliwake/next` embeds Foliwake pages in a Next.js App Router app. On the server it reads a page's body from
your Foliwake site with the credential, caches the origin's answer (`'use cache'`, tagged for revalidation),
checks and prepares the body per request, and adds preload hints. Route handlers serve the page's code
release and pictures from your app's own origin, and `withFoliwake` validates the config and sets a
Content-Security-Policy that fits. In the browser, `@foliwake/next/client` (everything of `@foliwake/react`)
mounts the page's blocks. Use it when your app is a Next 16.2+ App Router app with `cacheComponents`; for
another React app use `@foliwake/react` with `@foliwake/server`.

| Entry | What |
| --- | --- |
| `@foliwake/next/config` | `withFoliwake`, `foliwakeCspHeader` for `next.config.ts` |
| `@foliwake/next` | server-only: `<FoliwakeServerPage>`, `readPage`, `readEnvelopeCached`, `foliwakeTags`, config and origin client |
| `@foliwake/next/routes` | `codeRoute`, `mediaRoute`: the code and media proxies |
| `@foliwake/next/cache` | `readEnvelopeCached`: the cached live read alone |
| `@foliwake/next/client` | `'use client'`: everything of `@foliwake/react` |

## Install

The packages are published to GitHub Packages under the `@foliwake` scope. Add an `.npmrc` to your app:

```ini
@foliwake:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN` is a GitHub personal access token (classic) with `read:packages`; fine-grained tokens do
not work with this registry (on Vercel, set it as a build environment variable). Install exact versions, the
same for every `@foliwake/*` package:

```bash
pnpm add @foliwake/next@0.1.0 @foliwake/react@0.1.0 @foliwake/server@0.1.0
```

The app also needs `foliwake.remote.json` in its root (or `FOLIWAKE_REMOTE` naming another file): the site,
its live and preview origins, the names of the variables that hold passwords, and the app settings. The guide
below describes every key; the schema ships in `@foliwake/server/schemas/remote-2.schema.json`.

## Minimal example

```ts
// next.config.ts
import { withFoliwake } from '@foliwake/next/config';

export default withFoliwake({ cacheComponents: true }, { csp: { reportUri: '/csp-report' } });
```

```tsx
// app/pages/[[...path]]/page.tsx
import { Suspense } from 'react';
import { FoliwakeServerPage } from '@foliwake/next';
import { FoliwakePage } from '@foliwake/next/client';

type Params = Promise<{ path?: string[] }>;

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <LivePage params={params} />
    </Suspense>
  );
}

async function LivePage({ params }: { params: Params }) {
  const { path } = await params;
  return (
    <FoliwakeServerPage
      path={`/${(path ?? []).join('/')}`}
      prepare={{ rewriteLink: (href) => `/pages${href === '/' ? '' : href}` }}
      render={(page) => <FoliwakePage page={page} as="article" />}
    />
  );
}
```

```ts
// app/foliwake-code/[...path]/route.ts (the path is app.proxies.code of the config)
import { codeRoute } from '@foliwake/next/routes';

export const { GET, HEAD } = codeRoute({ authorizePreview: false });
```

A missing page, or one outside `app.pages`, calls `notFound()`; a body the check refuses throws to your
`error.tsx`. The `Suspense` boundary is required with `cacheComponents`.

## Examples

### Code and media proxies with preview for authors

The proxies serve only files of a code release and hashed pictures, add the credential on the server and
forward nothing from the browser. `authorizePreview` is required: your own author check, or `false` when the
app never shows preview.

```ts
// app/foliwake-media/[...path]/route.ts
import { mediaRoute } from '@foliwake/next/routes';

// Your app's sign-in decides; this cookie check is only a placeholder.
const isAuthor = (request: Request) => (request.headers.get('cookie') ?? '').includes('role=author');

export const { GET, HEAD } = mediaRoute({ authorizePreview: isAuthor });
```

### A preview page

Preview is read on every request (never cached) and loads the preview's code and pictures through the
proxies, which ask `authorizePreview`. Protect the page itself too.

```tsx
// app/preview/[[...path]]/page.tsx
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { FoliwakeServerPage } from '@foliwake/next';
import { FoliwakePage } from '@foliwake/next/client';

type Params = Promise<{ path?: string[] }>;

export default function Preview({ params }: { params: Params }) {
  return <Suspense fallback={null}><PreviewPage params={params} /></Suspense>;
}

async function PreviewPage({ params }: { params: Params }) {
  if ((await cookies()).get('role')?.value !== 'author') notFound();
  const { path } = await params;
  return <FoliwakeServerPage path={`/${(path ?? []).join('/')}`} channel="preview" render={(page) => <FoliwakePage page={page} />} />;
}
```

### CSP when the app sets its own headers

`withFoliwake(…, { csp })` adds `script-src 'self' 'unsafe-inline'` and the rest of the policy to every route.
If your app builds its own headers, leave `csp` out and use the value:

```ts
// next.config.ts
import { foliwakeCspHeader, withFoliwake } from '@foliwake/next/config';

export default withFoliwake({
  cacheComponents: true,
  async headers() {
    const csp = foliwakeCspHeader({ reportUri: '/csp-report', extra: { 'connect-src': ['https://api.example.org'] } });
    return [{ source: '/pages/:path*', headers: [{ key: 'Content-Security-Policy', value: csp }] }];
  },
});
```

A nonce-based policy does not work with partial prerendering and is not supported.

### Cache tags and revalidation

Only the live origin answer is cached, for `app.revalidate` seconds (default 300) with stale-while-revalidate
and at most 24 hours. Its tags are `foliwake`, `foliwake:<site>`, `foliwake:<site>:live` and
`foliwake:<site>:live:page:<path>` (`foliwakeTags`). Foliwake does not notify apps of publications yet, so
expire them from your own webhook or admin action:

```ts
// app/api/foliwake-revalidate/route.ts
import { revalidateTag } from 'next/cache';
import { foliwakeTags } from '@foliwake/next';

export async function POST(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.REVALIDATE_TOKEN}`) return new Response(null, { status: 401 });
  const { path } = (await request.json()) as { path?: string };
  // One page, or every live page of the site.
  const tag = path ? foliwakeTags('live', path).at(-1)! : foliwakeTags('live')[2]!;
  revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tag });
}
```

`revalidateTag(tag, 'max')` refreshes in the background instead (the next request still gets the cached
page).

### Read the page yourself

`readPage` gives the prepared page without rendering, for example to pass it to your own client component
together with other data, or to build metadata.

```tsx
// app/lessons/[slug]/page.tsx
import { Suspense } from 'react';
import { FoliwakeImportMap, readPage, emitPreloadHints } from '@foliwake/next';
import { FoliwakePage } from '@foliwake/next/client';

type Params = Promise<{ slug: string }>;

export default function Lesson({ params }: { params: Params }) {
  return <Suspense fallback={null}><LessonBody params={params} /></Suspense>;
}

async function LessonBody({ params }: { params: Params }) {
  const { slug } = await params;
  const page = await readPage(`/lessons/${slug}`, { mode: 'practice' });
  emitPreloadHints(page); // <link rel="preload" as="script"> for the blocks, in <head>
  return (
    <>
      <FoliwakeImportMap page={page} />
      <FoliwakePage page={page} />
    </>
  );
}
```

`<FoliwakeImportMap>` renders the page's import map: blocks import the engine's block-kit as `foliwake`, and
the map points that name at the kit of the page's own code release, scoped to the release's code path
(`<FoliwakeServerPage>` renders it for you). `@foliwake/client` adds the same map when it is missing. A map
that arrives after the document's first module load (a client navigation to a page of another code release)
is honoured only by browsers with multiple import maps (Chrome 133+); module hints are therefore `preload
as="script"`, never `modulepreload`, which would resolve `foliwake` before the map is there.

Unlike `<FoliwakeServerPage>`, `readPage` does not call `notFound()`: it throws `FoliwakePageError` (with
`kind` `not_found`, `not_allowed`, `invalid`, …) for you to handle.

## Compatibility

| | |
| --- | --- |
| Next.js | 16.2 or newer, below 17 (peer `>=16.2.0 <17`; tested with 16.2.12), App Router with `cacheComponents: true` |
| React | 19.2 or newer (tested with 19.3.0) |
| Node.js | 22.22 or newer |
| Foliwake origin | sends `X-Code-Release` with `.plain.html` (plain/2); an older origin gives pages without blocks |
| Config | `foliwake.remote.json` version 2 |

## Good to know

- `withFoliwake` adds `@foliwake/next` to `transpilePackages`: Next compiles `'use cache'` only in code it
  transpiles. If you do not use `withFoliwake`, add it yourself, or write the cached read in your app and pass
  it as `read` (the guide shows how).
- Under partial prerendering the status line is sent with the static shell, so a not-found page answers HTTP
  200 with the not-found content.
- The server modules import `server-only`, which throws when imported outside React Server Components. In unit
  tests outside Next (for example vitest), alias `server-only` to an empty module or run with the
  `react-server` condition. The package imports `next/cache.js`, `next/navigation.js` and `next/server.js`
  fully specified, so Node's ESM resolution finds them; builds of 0.1.0 made before this change import the bare
  `next/cache` and need an alias (`next/cache` → `next/cache.js`) in such tests.
- Block stylesheets: `<FoliwakePage>` links `components/<name>/<name>.css` for every block on the page
  without reading `components.json`, so blocks without a stylesheet produce 404 links. See the
  `@foliwake/react` notes for the workaround with `page.preload`.

## Guides

- [Embed Foliwake pages in a React or Next app](https://docs.foliwake.dev/guide/embed-in-react): the whole
  setup step by step, the config keys, caching and troubleshooting.
- [Roll out frontend code](https://docs.foliwake.dev/guide/code-rollout)

License: Apache-2.0.

<!-- usagestop -->

## API

<!-- api -->

<!-- Generated by `pnpm packages:reference` from the type declarations; do not edit by hand. -->

### `@foliwake/next`

**Functions and components**

#### `emitPreloadHints()`

Emits the page's hints into the document head (React DOM resource APIs; deduplicated by React). Modules are hinted as `preload as="script"` (the bytes, fetched in parallel), not `modulepreload`: a module preloaded before the page's import map is in the document fails to resolve `foliwake` for good, and in a Next app the hints reach &lt;head&gt; before the map (which renders with the page, and on a client navigation arrives later).

```ts
function emitPreloadHints(page: FoliwakePageData): void
```

**Returns** `void`

#### `foliwakeConfig()`

The app's Foliwake config (validated at build time by withFoliwake).

```ts
function foliwakeConfig(): FoliwakeAppConfig
```

**Returns** `FoliwakeAppConfig`

#### `FoliwakeImportMap()`

The import map of the page's code release (`foliwake` → its block-kit, scoped to the release's code path), as an element to render before the page's blocks load; null for a page without a code release. Browsers honour a map that arrives after the document's first module load (client navigation, a second release) only with multiple import maps (Chrome 133+); `@foliwake/client` adds the same map when it is missing.

```ts
function FoliwakeImportMap({ page }: {
    page: FoliwakePageData;
}): ReactNode
```

**Returns** `ReactNode`

#### `FoliwakeServerPage()`

A Foliwake page in a server component. Missing or not allowed → notFound(); other errors throw (error.tsx).

```ts
function FoliwakeServerPage(props: FoliwakeServerPageProps): Promise<ReactNode>
```

**Returns** `Promise<ReactNode>`

#### `foliwakeTags()`

Cache tags of a channel (and page): foliwake, foliwake:&lt;site&gt;, foliwake:&lt;site&gt;:&lt;channel&gt;, …:page:&lt;path&gt;.

```ts
function foliwakeTags(channel: ChannelName, path?: string): string[]
```

**Returns** `string[]`

#### `originClient()`

The origin client; credentials are read from process.env per request.

```ts
function originClient(): OriginClient
```

**Returns** `OriginClient`

#### `readEnvelopeCached()`

The live envelope of `path` from Next's cache (stale-while-revalidate); 404 → FoliwakePageError('not_found').

```ts
function readEnvelopeCached(path: string): Promise<PageEnvelope>
```

**Returns** `Promise<PageEnvelope>`

#### `readPage()`

The prepared page. Preview: `connection()` first (per request, never cached).

```ts
function readPage(path: string, opts?: ReadPageOptions): Promise<FoliwakePageData>
```

**Returns** `Promise<FoliwakePageData>`

**Interfaces**

#### `FoliwakeServerPageProps`

Props of `<FoliwakeServerPage>`.

```ts
interface FoliwakeServerPageProps
```

| Member | Type | Description |
| --- | --- | --- |
| `path` | `string` | The site's page path (`/`, `/lessons/a`); it must match `app.pages`. |
| `channel?` | `ChannelName` | `live` (default, cached) or `preview` (per request, never cached; protect the route). |
| `prepare?` | `PrepareOptions` | `preparePage` options: `rewriteLink`, `transform`, `mode`. |
| `read?` | `(path: string) => Promise<PageEnvelope>` | The live envelope reader; default readEnvelopeCached. |
| `hints?` | `boolean` | Preload hints for the blocks (default true): modulepreload/preload links in &lt;head&gt;, same-origin. |
| `render` | `(page: FoliwakePageData) => ReactNode` | Runs on the server; returns the app's client component with the page. |

#### `ReadPageOptions`

Options of `readPage`: the channel, the reader, hints, and `preparePage`'s options.

```ts
interface ReadPageOptions extends PrepareOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `channel?` | `ChannelName` | `live` (default, cached) or `preview` (read per request, never cached). |
| `read?` | `(path: string) => Promise<PageEnvelope>` | The live envelope reader; default readEnvelopeCached (or the app's own 'use cache' wrapper). |
| `hints?` | `boolean` | Compute same-origin preload hints for the page's blocks into `page.preload` (default true). |

**Also exported** (documented where they are defined)

- from `@foliwake/blocks-contract`: `ChannelName`
- from `@foliwake/blocks-contract/page`: `FoliwakePageData`, `PageEnvelope`, `PreloadHint`
- from `@foliwake/server/config`: `FoliwakeAppConfig`
- from `@foliwake/server/page`: `FoliwakePageError`, `PageErrorKind`, `pageImportMap`, `PrepareOptions`, `preparePage`, `readEnvelope`
- from `@foliwake/server/preload`: `preloadHints`

### `@foliwake/next/client`

**Also exported** (documented where they are defined)

- from `@foliwake/blocks-contract`: `BlockEventDetail`, `BlockEvents`, `BlockEventType`, `BlockHost`, `BlocksModule`, `ContractVersion`, `FoliwakeEvent`, `HostCore`, `MountHandle`, `MountReport`, `MountStatus`
- from `@foliwake/blocks-contract/page`: `ClientSettings`, `FoliwakePageData`
- from `@foliwake/client`: `BLOCK_EVENT_TYPES`, `CreatedHost`, `cssMounts`, `FoliwakeEventHandlers`, `FoliwakeHooks`, `FoliwakePageError`, `FoliwakePageStatus`, `HOST_CONTRACT_MINOR`, `HostInit`, `listenBlockEvents`
- from `@foliwake/react`: `createHost`, `FoliwakePage`, `FoliwakePageProps`, `FoliwakeProvider`, `useFoliwakeEvents`, `useFoliwakeSettings`

### `@foliwake/next/config`

**Functions and components**

#### `foliwakeCspHeader()`

The CSP value for this app's config (strategy A, media base included, 'unsafe-eval' in development).

```ts
function foliwakeCspHeader(opts?: {
    configFile?: string;
    reportUri?: string;
    extra?: CspOptions['extra'];
    dev?: boolean;
}): string
```

**Returns** `string`

#### `withFoliwake()`

Validates the Foliwake config when Next loads next.config (build and start) and makes it available to the package's server-only modules (Next `env`, never to client code); adds the package to transpilePackages (its 'use cache' read). Throws when the file is missing or invalid, naming the field.

```ts
function withFoliwake(nextConfig?: NextConfig, opts?: WithFoliwakeOptions): NextConfig
```

| Parameter | Type | Description |
| --- | --- | --- |
| `nextConfig?` | `NextConfig` | The app's own Next config; its `transpilePackages`, `env` and `headers` are kept. |
| `opts?` | `WithFoliwakeOptions` |  |

**Returns** `NextConfig`: The Next config to export from next.config.ts.

**Interfaces**

#### `WithFoliwakeOptions`

Options of `withFoliwake`.

```ts
interface WithFoliwakeOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `configFile?` | `string` | The config file (default FOLIWAKE_REMOTE, else ./foliwake.remote.json). |
| `csp?` | `false \| { reportUri?: string; extra?: CspOptions['extra']; source?: string; }` | Adds the Content-Security-Policy header (strategy 'self-inline': `script-src 'self' 'unsafe-inline'`) to the routes matching `source` (default every route, `/:path*`). `reportUri` adds `report-uri`; `extra` adds sources per directive. `false` (default): the app sets its own; use foliwakeCspHeader() for the value. |

### `@foliwake/next/routes`

**Functions and components**

#### `codeRoute()`

Route handlers for `app/<proxies.code>/[...path]/route.ts`: serve the files of a code release from the app's origin (`codeHandler` of `@foliwake/server/handlers`). Usage: `export const { GET, HEAD } = codeRoute({ authorizePreview: isAuthor })`. Each handler takes `(request, { params })` and returns a `Response`.

```ts
function codeRoute(opts: {
    authorizePreview: AuthorizePreview;
}): {
    GET: RouteHandler;
    HEAD: RouteHandler;
}
```

| Parameter | Type | Description |
| --- | --- | --- |
| `opts` | `{ authorizePreview: AuthorizePreview; }` | `authorizePreview`: the app's author check for preview files, or `false`; required. |

**Returns** `{ GET: RouteHandler; HEAD: RouteHandler; }`

#### `mediaRoute()`

Route handlers for `app/<proxies.media>/[...path]/route.ts`: serve hashed pictures (`mediaHandler` of `@foliwake/server/handlers`). Usage: `export const { GET, HEAD } = mediaRoute({ authorizePreview: isAuthor })`.

```ts
function mediaRoute(opts: {
    authorizePreview: AuthorizePreview;
}): {
    GET: RouteHandler;
    HEAD: RouteHandler;
}
```

| Parameter | Type | Description |
| --- | --- | --- |
| `opts` | `{ authorizePreview: AuthorizePreview; }` | `authorizePreview`: the app's author check for preview pictures, or `false`; required. |

**Returns** `{ GET: RouteHandler; HEAD: RouteHandler; }`

### `@foliwake/next/cache`

**Functions and components**

#### `readEnvelopeCachedEntry()`

The cached entry itself (`'use cache'`, tags of `foliwakeTags('live', path)`); readEnvelopeCached unwraps it.

```ts
function readEnvelopeCachedEntry(path: string): Promise<CachedEnvelope>
```

**Returns** `Promise<CachedEnvelope>`

**Types**

#### `CachedEnvelope`

What the cache stores: an envelope, or the fact that the page does not exist.

```ts
type CachedEnvelope = {
    found: true;
    envelope: PageEnvelope;
} | {
    found: false;
    path: string;
}
```

**Also exported** (documented where they are defined)

- from `@foliwake/next`: `readEnvelopeCached`

<!-- apistop -->
