# Embed pages in a Next.js app

This guide shows Foliwake pages inside a Next.js App Router app, step by step.
Your app's layout, navigation and sign-in stay around the page; the page's blocks work inside it.
Read [Concepts](/concepts) first if "code release" or "host" are new to you.

## What you build

![The browser talks only to your Next app. On the server, with the credential, the app serves /pages/... by reading the page's .plain.html from Foliwake live or preview (cached), proxies the page's code release under /foliwake-code and pictures under /foliwake-media.](/diagrams/next-app.svg)

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
npm install @foliwake/next@0.3.0 @foliwake/react@0.3.0 @foliwake/server@0.3.0
```

Use the same exact version for every `@foliwake/*` package.

## Step 2: the config file

`foliwake.remote.json` sits in the app's root and is committed.
It holds no secrets, only the **names** of the variables that hold them.

```json
{
  "$schema": "./node_modules/@foliwake/server/schemas/remote-2.schema.json",
  "version": 2,
  "site": "my-site",
  "live": { "url": "https://my-site.example.org" },
  "preview": {
    "url": "https://preview.my-site.example.org",
    "auth": { "type": "basic", "username": "app", "passwordEnv": "MY_SITE_PREVIEW_PASSWORD" }
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
| `app.proxies` | your app's URL prefixes for the code and media proxies |
| `app.blocks.entry` | the blocks module's path inside a code release; without it, pages stay static |
| `app.blocks.contract` | `foliwake-blocks/2`; a module of another major is not mounted |
| `app.blocks.eventPrefix` | the prefix you expect on block events (`demo:answer`) |
| `app.revalidate` | seconds before a cached page is refreshed (default 300) |

`auth` is `{ "type": "basic", "username", "passwordEnv" }`, or `{ "type": "service-token", … }` for a delivery
that checks signed tokens (see [`@foliwake/server`](/reference/packages/server)).
Put the secret itself in the environment of the app's server:

```sh
export MY_SITE_PREVIEW_PASSWORD='…'
```

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
- Foliwake does not notify apps of publications yet.
  Expire the tags from your own webhook or admin action:

```ts
// app/api/foliwake-revalidate/route.ts
import { revalidateTag } from 'next/cache';
import { foliwakeTags } from '@foliwake/next';

export async function POST(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.REVALIDATE_TOKEN}`) {
    return new Response(null, { status: 401 });
  }
  const { path } = (await request.json()) as { path?: string };
  const tag = path ? foliwakeTags('live', path).at(-1)! : foliwakeTags('live')[2]!;
  revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tag });
}
```

Something does not work? See [Troubleshooting](/embed/troubleshooting).
