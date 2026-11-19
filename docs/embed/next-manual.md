# Next.js: manual setup

This page sets up Foliwake pages in a Next.js App Router app by hand, step by step, with a
`foliwake.remote.json` version 2 file.
[`npx @foliwake/next init`](/embed/next) does the same in one command with `FOLIWAKE_URL`; read this page to see
every part, or when your app needs a version 2 config (for example several environments in files).
Your app's layout, navigation and sign-in stay around the page; the page's blocks work inside it.
Read [Concepts](/concepts) first if "code release" or "host" are new to you.

## What you build

<Diagram name="next-app" alt="The browser talks only to your Next app. On the server, with the credential, the app serves /pages/... by reading the page's .plain.html from Foliwake live or preview (cached), proxies the page's code release under /foliwake-code and pictures under /foliwake-media." />

- The app reads a page's body on the server, checks it, and renders it inside your layout.
- The page's blocks come from the same code release as the body.
  Your app serves them from its own origin: the browser never talks to Foliwake and no credential reaches it.
- Your app gives blocks a host (language, labels, and your extension's members) and receives their events.

## Before you start

- Node.js 22.22 or newer; Next.js 16.2 or newer with the App Router and `cacheComponents`; React 19.2 or newer.
- A Foliwake site whose origin sends `X-Code-Release` with `.plain.html`. Check it:

  ```sh
  curl -sI https://my-site.example.org/index.plain.html | grep -i -E 'x-code-release|x-html-contract'
  ```

  Without `X-Code-Release: cd_…` the app refuses the page.
- A blocks module in the site's code, for example `scripts/blocks.js`.
  It exports `BLOCKS_CONTRACT` and `mountBlocks(container, host)`;
  [`@foliwake/blocks-contract`](/reference/packages/blocks-contract#write-a-blocks-module) shows one.

## Step 1: install

```sh
npm install @foliwake/next
```

`@foliwake/next` brings `@foliwake/react` and `@foliwake/server` at its own exact version; do not add them.
Add `@foliwake/blocks-contract` (same version) only when your code imports its types,
for example `@foliwake/blocks-contract/assessment` in Step 6.

## Step 2: the config file

`foliwake.remote.json` sits in the app's root and is committed.
It holds no secrets, only the **names** of the variables that hold them.

```json
{
  "$schema": "./node_modules/@foliwake/next/schemas/remote-2.schema.json",
  "version": 2,
  "site": "my-site",
  "live": { "url": "https://my-site.example.org" },
  "preview": {
    "url": "https://preview.my-site.example.org",
    "auth": { "type": "basic", "username": "preview", "passwordEnv": "MY_SITE_PREVIEW_TOKEN" }
  },
  "app": {
    "pages": ["/**"],
    "proxies": { "code": "/foliwake-code", "media": "/foliwake-media", "pages": null },
    "blocks": { "entry": "scripts/blocks.js", "contract": "foliwake-blocks/2", "eventPrefix": "demo" },
    "revalidate": 300
  }
}
```

| Key | What |
| --- | --- |
| `site` | the site's id |
| `live`, `preview` | `url`: the site's origin (https; http only for loopback hosts) and optional `auth` |
| `app.pages` | page globs the app may read; `/x/**` also matches `/x`; any other path is refused |
| `app.proxies` | your app's URL prefixes for the code and media proxies; `pages` must be `null` (below) |
| `app.blocks.entry` | the blocks module's path inside a code release; without it, pages stay static |
| `app.blocks.contract` | `foliwake-blocks/2`; a module of another major is not mounted |
| `app.blocks.eventPrefix` | the prefix you expect on block events (`demo:answer`) |
| `app.media` | optional `{ "base", "transform" }`: a media host for live pictures (Step 3) |
| `app.revalidate` | seconds before a cached page is refreshed (default 300) |

`auth` is `{ "type": "basic", "username", "passwordEnv" }`, or `{ "type": "service-token", … }` for a delivery
that checks signed tokens (see [`@foliwake/server`](/reference/packages/server)).
Put the secret itself in the environment of the app's server:

```sh
export MY_SITE_PREVIEW_TOKEN='…'
```

A Foliwake preview host accepts HTTP Basic only with the user name `preview` and the site's preview token
as the password; any other user name is refused.
A site admin gets the token with `foliwake site preview-token --site <site>`, or from the site's page in the
admin; it is shown once and the request is logged.

`app.proxies.pages` must be `null`: this version has no pages proxy, because pages are read on your server and
never fetched by the browser. The key is reserved for client-side reads in a later version.

`FOLIWAKE_REMOTE=<file>` names another config file, for example one per environment.
The browser receives only the site id, the proxy prefixes and the blocks contract and prefix.

## Step 3: next.config.ts

```ts
// next.config.ts
import { withFoliwake } from '@foliwake/next/config';

export default withFoliwake({ cacheComponents: true }, { csp: { reportUri: '/csp-report' } });
```

`withFoliwake` validates the config when Next starts or builds (a mistake fails the build and names the field),
adds `@foliwake/next` to `transpilePackages`, and with `csp` sets this policy on every route:

```text
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Blocks load from your own origin, so no Foliwake host appears in it.
If your app builds its own headers, leave `csp` out and use `foliwakeCspHeader()` from the same module.

`app.media.base`, when set, is added to `img-src` (its origin only).
With `"transform": "cloudflare-images"`, live pictures are sent through Cloudflare Images on that host.

**If the site resizes images on a CDN**, every live page body lists that CDN's addresses in `srcset`,
and Foliwake leaves them as they are.
Your policy must allow that origin, or the browser blocks those images and does not fall back to `src`.
The policy is one header for every route, chosen before any page is read, so it cannot come from the page.
Name the CDN in `foliwake.remote.json` instead:

```json
"media": { "base": "https://media.example.org", "transform": null }
```

`transform: null` only adds the origin to `img-src`; pictures without a CDN address still go through your media proxy.
Preview bodies never need it. If you build the policy yourself, pass the same address as `mediaBase` to `foliwakeCsp()`
of `@foliwake/server/csp`.

## Step 4: the code and media proxies

```ts
// app/foliwake-code/[...path]/route.ts
import { codeRoute } from '@foliwake/next/routes';

// Your sign-in decides who is an author; this cookie check is only a placeholder.
const isAuthor = (request: Request) => (request.headers.get('cookie') ?? '').includes('role=author');

export const { GET, HEAD } = codeRoute({ authorizePreview: isAuthor });
```

```ts
// app/foliwake-media/[...path]/route.ts
import { mediaRoute } from '@foliwake/next/routes';

const isAuthor = (request: Request) => (request.headers.get('cookie') ?? '').includes('role=author');

export const { GET, HEAD } = mediaRoute({ authorizePreview: isAuthor });
```

They serve only files of a `cd_…` code release and hashed pictures.
They add the credential on the server and forward nothing from the browser.
Live files are cached for a year (they never change); preview answers are `private, no-store`.

`authorizePreview` is required, so that preview is never open by accident.
Pass `false` when the app never shows preview.

## Step 5: a page route

```tsx
// app/pages/[[...path]]/page.tsx
import { Suspense } from 'react';
import { FoliwakeServerPage } from '@foliwake/next';
import { FoliwakePage } from '@foliwake/next/client';

type Params = Promise<{ path?: string[] }>;

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
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

On a request:

1. The live body comes from Next's cache, or from the origin with the credential.
   Only the origin's answer (the envelope) is cached, so a body is never paired with other code.
2. On every request the body is checked: no scripts, styles, frames, inline SVG, `on…` attributes or
   `javascript:` URLs. Links and pictures are rewritten (`rewriteLink` maps the site's `/help` to `/pages/help`),
   your optional `transform` runs, and the result is checked again.
3. Preload hints for the page's blocks go into `<head>`, and the page's import map is rendered with it.
4. `render` returns your component with the prepared page.

A missing page, or one outside `app.pages`, shows the not-found page.
A body the check refuses throws to your `error.tsx`.
The `Suspense` boundary is required with `cacheComponents`.

## Step 6: host and events

Give blocks your app's side of the contract in a client component:

```tsx
// components/page-view.tsx
'use client';
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FoliwakePage, type FoliwakePageData } from '@foliwake/next/client';
import type { AssessmentEvents, AssessmentHostMembers } from '@foliwake/blocks-contract/assessment';

export function PageView({ page }: { page: FoliwakePageData }) {
  const [log, setLog] = useState<string[]>([]);
  return (
    <>
      <FoliwakePage<AssessmentHostMembers, AssessmentEvents>
        page={page}
        host={{ labels: { check: 'Check' }, mode: 'practice', react: { createElement, createRoot } }}
        events={['answer', 'complete']}
        onEvent={(event) => setLog((lines) => [`${event.type} ${event.detail.key}`, ...lines])}
        onStatus={(status) => console.log('blocks', status)}
        onError={({ code, message }) => console.warn(code, message)}
      />
      <ol>{log.map((line, i) => <li key={i}>{line}</li>)}</ol>
    </>
  );
}
```

Then use it in the route: `render={(page) => <PageView page={page} />}`.

- `<FoliwakePage>` renders the body on the server, so it is readable before any JavaScript.
  In the browser it imports the blocks module from `/foliwake-code/cd_…/` and calls `mountBlocks`.
- `host`: `labels` translate block chrome and win over a block's own `ui`.
  `react` gives React blocks your app's React, so the page does not load a second one.
  Changes take effect without a remount.
- `onEvent` receives `ready`, `error` and the types named in `events`,
  each with `detail.key` (a stable block key) and `detail.block`.
- `onStatus`: `mounting`, then `ready`, `partial` (some blocks failed) or `static` (no blocks; `onError` says why).
- It remounts only when the page changes (body, code release, channel or mode).

## Step 7: preview for authors

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
  const pagePath = `/${(path ?? []).join('/')}`;
  return <FoliwakeServerPage path={pagePath} channel="preview" render={(page) => <FoliwakePage page={page} />} />;
}
```

Preview is read on every request, never cached.
Its code and pictures go through the proxies, which ask `authorizePreview`.
Use your app's real sign-in instead of the cookie check.

With `cacheComponents` (partial prerendering) the status line is sent with the static shell.
So a missing preview or page answers HTTP 200 with your not-found content and `noindex`;
nothing of the body is sent.

## Step 8: run it

```sh
npm run build && npm start
```

Open `http://localhost:3000/pages/` and check:

- the page shows inside your layout, and the status says `ready`;
- in the network panel, `/foliwake-code/cd_…/scripts/blocks.js` and the block files answer `200` from your origin;
- the console shows no CSP errors;
- navigating to another page mounts its blocks too.

## Caching

- Only the live origin answer is cached, for `app.revalidate` seconds, with stale-while-revalidate,
  and at most 24 hours.
- Its tags are `foliwake`, `foliwake:<site>`, `foliwake:<site>:live` and `foliwake:<site>:live:page:<path>`
  (`foliwakeTags`).
- A Foliwake server whose site lists your app as a hook target calls it after every change, once the change
  is live and the caches in front of the origin serve it.
  Mount the handler and give it the shared secret:

```ts
// app/api/webhooks/foliwake/route.ts
import { foliwakeRevalidateHandler } from '@foliwake/next/revalidate';

export const { POST } = foliwakeRevalidateHandler({ secretEnv: 'FOLIWAKE_HOOK_SECRET' });
```

- It checks the signature and expires the tag of every changed path, or `foliwake:<site>:live` when every page
  changed; the next request of each page reads it again.
- Another cached read of a changed path (an index, a sitemap) needs the path's tag,
  `foliwakeTags('live', path)`, to be expired with it.
- `app.revalidate` stays the safety net when a hook is lost.

Something does not work? See [Troubleshooting](/embed/troubleshooting).
