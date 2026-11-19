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
| `@foliwake/next/page` | `default`, `generateMetadata`, `createFoliwakePage`: a ready page route (`app/[...path]/page.tsx`) |
| `@foliwake/next/handler` | `GET`, `HEAD`, `POST`, `createFoliwakeHandler`: every Foliwake route (code, media, hook, health) in one route file |
| `@foliwake/next/routes` | `codeRoute`, `mediaRoute`: the code and media proxies |
| `@foliwake/next/cache` | `readEnvelopeCached`: the cached live read alone; `setGenerationFloor` |
| `@foliwake/next/revalidate` | `foliwakeRevalidateHandler`: the route of the hook a Foliwake server calls after a change |
| `@foliwake/next/client` | `'use client'`: everything of `@foliwake/react` |

## Install

The packages are published on npm (npmjs.com) under the `@foliwake` scope; no registry setup or token is
needed. Install one package; it brings `@foliwake/react` and `@foliwake/server` at its own exact version:

```bash
pnpm add @foliwake/next
```

The app also needs `foliwake.remote.json` in its root (or `FOLIWAKE_REMOTE` naming another file): the site,
its live and preview origins, the names of the variables that hold passwords, and the app settings. The guide
below describes every key; the schema ships in this package as `schemas/remote-2.schema.json`
(`"$schema": "./node_modules/@foliwake/next/schemas/remote-2.schema.json"`).

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
`foliwake:<site>:live:page:<path>` (`foliwakeTags`).

A Foliwake server whose site lists your app as a hook target calls it once a change is live and the caches in
front of the origin serve it (`delivery.settled`, signed with a shared secret). Mount the handler:

```ts
// app/api/webhooks/foliwake/route.ts
import { foliwakeRevalidateHandler } from '@foliwake/next/revalidate';

export const { POST } = foliwakeRevalidateHandler({ secretEnv: 'FOLIWAKE_HOOK_SECRET' });
```

It checks the signature (within 300 s; `previousSecretEnv` names a second accepted secret while you rotate it)
and expires `foliwake:<site>:live:page:<path>` of every changed path, or `foliwake:<site>:live` when every page
changed (a code release, a large publication). Paths that are not pages, such as an index, get the same tag:
tag your own cached reads of them with `foliwakeTags('live', path)`. By default a tag is expired with
`{ expire: 0 }`: the next request waits for one fresh read and never sees the old page; `mode: 'max'` serves
the old page once while it is read again. Changed pages (at most 20, never when every page changed) are read
again right after the answer (`warm: false` turns this off). `onDelivery(payload)` runs for every delivery: a
throw answers 500 and the server sends it again. A `ping` answers `{ ok: true, site, sdk }` and expires
nothing. `app.revalidate` stays the safety net when a hook is lost.

#### Generation floor

Each delivery carries the live `generation`, which only grows. If your app keeps the highest generation it was
told (a database row written from `onDelivery`), register it with `setGenerationFloor`: a cached read that
answers an older generation (a cache in front of the origin still had the old page) then lives at most 15
seconds and is read again, instead of `app.revalidate` seconds. Without a floor nothing changes. A floor that
cannot be read turns the check off for that read (logged); an origin without `X-Site-Generation` is never
held back.

```ts
// lib/foliwake-floor.ts: import it wherever pages are read and from the hook route
import { setGenerationFloor } from '@foliwake/next/cache';

const floors = new Map<string, number>(); // use your database: every server instance must see the floor

setGenerationFloor(async (site) => floors.get(site) ?? null);

export function recordGeneration(site: string, generation: number, kind: string): void {
  const floor = floors.get(site) ?? 0;
  floors.set(site, kind === 'init' ? generation : Math.max(floor, generation)); // init starts a new history
}
```

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

`<FoliwakeImportMap>` renders the page's import map: blocks import the block kit as `@foliwake/block-kit`,
and the map points that name at the kit of the page's own code release, scoped to the release's code path
(`<FoliwakeServerPage>` renders it for you). `@foliwake/client` adds the same map when it is missing. A map
that arrives after the document's first module load (a client navigation to a page of another code release)
is honoured only by browsers with multiple import maps (Chrome 133+); module hints are therefore `preload
as="script"`, never `modulepreload`, which would resolve the kit's specifier before the map is there. With the CSP
strategy `nonce`, pass the request's nonce to `<FoliwakeServerPage nonce>` / `<FoliwakeImportMap nonce>` and to
`<FoliwakePage nonce>` (the map the client adds on a navigation).

Unlike `<FoliwakeServerPage>`, `readPage` does not call `notFound()`: it throws `FoliwakePageError` (with
`kind` `not_found`, `not_allowed`, `invalid`, …) for you to handle.

### Write the cached read yourself

If Next does not compile the packaged cache (an unusual setup), write the cached live read in your app and
pass it to `<FoliwakeServerPage read={readLiveEnvelope}>`:

```ts
// lib/foliwake.ts
import { cacheLife, cacheTag } from 'next/cache';
import { foliwakeConfig, foliwakeTags, originClient, readEnvelope } from '@foliwake/next';

export async function readLiveEnvelope(path: string) {
  'use cache';
  cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
  cacheTag(...foliwakeTags('live', path));
  const config = foliwakeConfig();
  return readEnvelope(config, originClient(), config.site, 'live', path);
}
```

## Compatibility

| | |
| --- | --- |
| Next.js | 16.2 or newer, below 17 (peer `>=16.2.0 <17`; tested with 16.2.12), App Router with `cacheComponents: true` |
| React | 19.2 or newer (tested with 19.3.0) |
| Node.js | 22.22 or newer |
| Foliwake origin | plain/2: `X-Code-Release` with every `.plain.html` (a body without it is refused) |
| Config | `foliwake.remote.json` version 2 |

Changes per version, breaking ones marked: `CHANGELOG.md` in the package
(`node_modules/@foliwake/next/CHANGELOG.md`).

## Good to know

- `withFoliwake` adds `@foliwake/next` to `transpilePackages`: Next compiles `'use cache'` only in code it
  transpiles. If you do not use `withFoliwake`, add it yourself, or write the cached read in your app and pass
  it as `read` (see "Write the cached read yourself" above).
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

## See also

- [`@foliwake/server`](https://www.npmjs.com/package/@foliwake/server): every key of `foliwake.remote.json`,
  the proxies and the body check.
- [`@foliwake/react`](https://www.npmjs.com/package/@foliwake/react): `<FoliwakePage>`, the host and events.
- [`@foliwake/client`](https://www.npmjs.com/package/@foliwake/client): the browser lifecycle under both.

License: Apache-2.0.

<!-- usagestop -->

## API

<!-- api -->

<!-- Generated by `pnpm packages:reference` from the type declarations; do not edit by hand. -->

### `@foliwake/next`

**Functions and components**

#### `emitPreloadHints()`

Emits the page's hints into the document head (React DOM resource APIs; deduplicated by React). Modules are hinted as `preload as="script"` (the bytes, fetched in parallel), not `modulepreload`: a module preloaded before the page's import map is in the document fails to resolve the kit's specifier for good, and in a Next app the hints reach &lt;head&gt; before the map (which renders with the page, and on a client navigation arrives later).

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

The import map of the page's code release (`@foliwake/block-kit` → its block-kit, scoped to the release's code path), as an element to render before the page's blocks load; null for a page without a code release. Browsers honour a map that arrives after the document's first module load (client navigation, a second release) only with multiple import maps (Chrome 133+); `@foliwake/client` adds the same map when it is missing.

```ts
function FoliwakeImportMap({ page, nonce }: {
    page: FoliwakePageData;
    nonce?: string;
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
| `nonce?` | `string` | The request's CSP nonce (`foliwakeCsp({ strategy: 'nonce', nonce })`): set on the page's import map. Pass it to your `<FoliwakePage nonce>` too, so a map the browser adds on a client navigation carries it. |
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
- from `@foliwake/blocks-contract/import-map`: `pageImportMap`
- from `@foliwake/blocks-contract/page`: `FoliwakePageData`, `PageEnvelope`, `PreloadHint`
- from `@foliwake/server/config`: `FoliwakeAppConfig`
- from `@foliwake/server/page`: `FoliwakePageError`, `PageErrorKind`, `PrepareOptions`, `preparePage`, `readEnvelope`
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

### `@foliwake/next/page`

**Functions and components**

#### `createFoliwakePage()`

A page route of Foliwake pages: reads the page of the route's path (live: cached; preview: per request, behind `authorize`), renders it in a Suspense boundary, emits the blocks' preload hints and the import map. A missing page, one outside `app.pages`, or a refused author check is `notFound()`. `generateMetadata` gives the title (the body's first `<h1>`) and `noindex` for preview.

```ts
function createFoliwakePage(opts?: FoliwakePageOptions): FoliwakeRoute
```

**Returns** `FoliwakeRoute`

**Constants**

#### `default`

```ts
const route: FoliwakeRoute
```

#### `generateMetadata`

The default route's metadata.

```ts
const generateMetadata: (props: FoliwakeRouteProps) => Promise<PageMetadata>
```

**Interfaces**

#### `FoliwakePageOptions`

Options of `createFoliwakePage`.

```ts
interface FoliwakePageOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `render?` | `(page: FoliwakePageData) => ReactNode` | Returns the app's component for the page; default `<FoliwakePage page={page} as="article" />`. |
| `prepare?` | `PrepareOptions` | `preparePage` options; `rewriteLink` defaults to the mount's. |
| `channel?` | `ChannelName` | `live` (default, cached) or `preview` (per request; needs `authorize`). |
| `authorize?` | `() => boolean \| Promise<boolean>` | The app's author check (cookies(), headers(), its session); false → not found. Required for preview. |
| `mount?` | `string` | The app path the route is mounted at, such as `/pages`; default the root. |
| `fallback?` | `ReactNode` | The Suspense fallback while the page is read; default none. |

#### `FoliwakeRouteProps`

The route's props: Next's params of a catch-all segment `[...path]` or `[[...path]]`.

```ts
interface FoliwakeRouteProps
```

| Member | Type | Description |
| --- | --- | --- |
| `params` | `Promise<{ path?: string[]; }>` |  |

**Types**

#### `FoliwakeRoute`

A page route component with its `generateMetadata`.

```ts
type FoliwakeRoute = ((props: FoliwakeRouteProps) => ReactNode) & {
    generateMetadata: (props: FoliwakeRouteProps) => Promise<PageMetadata>;
}
```

### `@foliwake/next/handler`

**Functions and components**

#### `createFoliwakeHandler()`

The Foliwake routes of a Next app (code and media proxies, hook, health) for `app/foliwake/[...path]/route.ts`. Preview is off unless `authorizePreview` is given.

```ts
function createFoliwakeHandler(opts?: FoliwakeNextHandlerOptions): FoliwakeRoutes
```

| Parameter | Type | Description |
| --- | --- | --- |
| `opts?` | `FoliwakeNextHandlerOptions` | `authorizePreview` (default false), `hook` (default on, secret in FOLIWAKE_HOOK_SECRET), `base`. |

**Returns** `FoliwakeRoutes`

**Constants**

#### `GET`

The default routes: preview off, hook on (FOLIWAKE_HOOK_SECRET).

```ts
const GET: RouteHandler
```

#### `HEAD`

```ts
const HEAD: RouteHandler
```

#### `POST`

```ts
const POST: RouteHandler
```

**Interfaces**

#### `FoliwakeNextHandlerOptions`

Options of `createFoliwakeHandler`.

```ts
interface FoliwakeNextHandlerOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `authorizePreview?` | `AuthorizePreview` | The app's author check for preview files; default `false` (preview answers 404). |
| `hook?` | `false \| FoliwakeNextHookOptions` | The hook (default secret variable FOLIWAKE_HOOK_SECRET); `false` answers 404 on `/foliwake/hook`. |
| `base?` | `string` | The app path of the hook and health routes; default `/foliwake` (the route file's folder). |

#### `FoliwakeRoutes`

The route module exports: `export const { GET, HEAD, POST } = createFoliwakeHandler(…)`.

```ts
interface FoliwakeRoutes
```

| Member | Type | Description |
| --- | --- | --- |
| `GET` | `RouteHandler` |  |
| `HEAD` | `RouteHandler` |  |
| `POST` | `RouteHandler` |  |

**Types**

#### `FoliwakeNextHookOptions`

The hook options of the Next handler: those of `foliwakeRevalidateHandler`, the secret variable optional.

```ts
type FoliwakeNextHookOptions = Omit<FoliwakeRevalidateOptions, 'secretEnv'> & {
    secretEnv?: string;
}
```

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

The cached entry itself (`'use cache'`, tags of `foliwakeTags('live', path)`); readEnvelopeCached unwraps it. It lives `app.revalidate` seconds, or 15 seconds when its generation is below the floor of `setGenerationFloor`.

```ts
function readEnvelopeCachedEntry(path: string): Promise<CachedEnvelope>
```

**Returns** `Promise<CachedEnvelope>`

#### `setGenerationFloor()`

Registers how the cached read learns the generation floor (for example a database row the hook's `onDelivery` writes). A cached answer with an older `X-Site-Generation` is kept at most 15 seconds instead of `app.revalidate`. Call it at module scope of a module that every route reading pages imports; `null` removes it.

```ts
function setGenerationFloor(floor: GenerationFloor | null): void
```

| Parameter | Type | Description |
| --- | --- | --- |
| `floor` | `GenerationFloor \| null` | `(site) => Promise<number \| null>`; a throw turns the check off for that read (logged). |

**Returns** `void`

**Constants**

#### `BEHIND_FLOOR_LIFETIME`

The lifetime of an answer older than the floor: shown at most 15 s, then read again.

```ts
const BEHIND_FLOOR_LIFETIME: EntryLifetime
```

**Interfaces**

#### `EntryLifetime`

A cache lifetime as `cacheLife` takes it, in seconds.

```ts
interface EntryLifetime
```

| Member | Type | Description |
| --- | --- | --- |
| `stale` | `number` |  |
| `revalidate` | `number` |  |
| `expire` | `number` |  |

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

#### `GenerationFloor`

The highest live generation the app was told for a site, or null when it knows none.

```ts
type GenerationFloor = (site: string) => Promise<number | null>
```

**Also exported** (documented where they are defined)

- from `@foliwake/next`: `readEnvelopeCached`

### `@foliwake/next/revalidate`

**Functions and components**

#### `foliwakeRevalidateHandler()`

The route handler of the Foliwake hook, for `app/api/webhooks/foliwake/route.ts`: `export const { POST } = foliwakeRevalidateHandler({ secretEnv: 'FOLIWAKE_HOOK_SECRET' })`. A delivery expires `foliwake:<site>:live:page:<path>` of every listed path (pages and other files alike, such as an index), or `foliwake:<site>:live` when every page changed, and answers `{ ok: true, revalidated }`. A `ping` answers `{ ok: true, site, sdk }` and expires nothing. 401: bad or expired signature; 400: not a payload, or another site; 413: over 64 KiB.

```ts
function foliwakeRevalidateHandler(opts: FoliwakeRevalidateOptions): FoliwakeHookRoute
```

| Parameter | Type | Description |
| --- | --- | --- |
| `opts` | `FoliwakeRevalidateOptions` | `secretEnv` (required), `previousSecretEnv`, `mode`, `warm`, `onDelivery`, `toleranceS`. |

**Returns** `FoliwakeHookRoute`

**Interfaces**

#### `FoliwakeHookRoute`

The route module exports of the hook: `export const { POST } = foliwakeRevalidateHandler(…)`.

```ts
interface FoliwakeHookRoute
```

| Member | Type | Description |
| --- | --- | --- |
| `POST` | `(request: Request) => Promise<Response>` |  |

#### `FoliwakeRevalidateOptions`

Options of `foliwakeRevalidateHandler`.

```ts
interface FoliwakeRevalidateOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `secretEnv` | `string` | The environment variable holding the shared secret (the one the Foliwake server signs with). |
| `previousSecretEnv?` | `string` | While the secret is rotated: the variable holding the previous secret, also accepted. |
| `mode?` | `'expire' \| 'max'` | `expire` (default): `revalidateTag(tag, { expire: 0 })`, the next request waits for a fresh read and never sees the old page; the server sends the hook only after its caches serve the new page. `max`: `revalidateTag(tag, 'max')`, the next request gets the old page once while it is read again in the background. |
| `warm?` | `boolean` | Read the changed pages again right after the response (at most 20, never when every page changed), so the first visitor of this region finds them cached. Default true. |
| `onDelivery?` | `(payload: FoliwakeDeliveryPayload) => void \| Promise<void>` | Called for every delivery after its tags are expired (a log, a metric, the generation floor); a throw answers 500 and the server sends the delivery again. |
| `toleranceS?` | `number` | The allowed clock distance of the signature, in seconds. Default 300. |

**Also exported** (documented where they are defined)

- from `@foliwake/server/hook`: `FoliwakeDeliveryPayload`, `FoliwakeHookPayload`, `FoliwakeOperationKind`

### `@foliwake/next/schemas/remote-2.schema.json`

A file, not a module: `schemas/remote-2.schema.json` in the package.

### `@foliwake/next/schemas/remote-3.schema.json`

A file, not a module: `schemas/remote-3.schema.json` in the package.

<!-- apistop -->
