# Embed pages in a Next.js app

Foliwake pages inside a Next.js App Router app: your layout, navigation and sign-in around the page, the page's
blocks working inside it. Read [Concepts](/concepts) first if "code release" or "host" are new to you.

## Quick start

```sh
npm install @foliwake/next
npx @foliwake/next init --url https://my-site.example.org
npm run dev
```

Open `http://localhost:3000/<a page of the site>`, for example `/lessons/a`.
Your own routes win; `/` stays your app's.

`init` checks the site first and prints what it found and what it did:

```text
✓ https://my-site.example.org: site my-site, plain/2, blocks entry="scripts/blocks.js", contract=2, prefix="demo"
✓ .env.local                           created: FOLIWAKE_URL (secrets: names only)
✓ next.config.ts                       updated: wrapped in withFoliwake()
✓ app/foliwake/[...path]/route.ts      created: code, media and hook routes
✓ app/[...path]/page.tsx               created: site pages (your own routes win)
```

You need Node.js 22.22 or newer, Next.js 16.2 or newer with the App Router and `cacheComponents`, and a site on a
Foliwake engine that serves `/.well-known/foliwake.json`.

## What init did

| File | What |
| --- | --- |
| `.env.local` | `FOLIWAKE_URL`, the site's live URL: the only setting |
| `next.config.ts` | `withFoliwake(…)`: reads the site's discovery document when Next starts or builds |
| `app/foliwake/[...path]/route.ts` | `export { GET, HEAD, POST } from '@foliwake/next/handler'` |
| `app/[...path]/page.tsx` | `export { default, generateMetadata } from '@foliwake/next/page'` |

- **Discovery.** `withFoliwake` reads `FOLIWAKE_URL/.well-known/foliwake.json` (the site's id, its preview host,
  its media CDN, the contract versions) and builds the app's config into the server bundle.
  Nothing is fetched at run time; a site that cannot be read fails the build with the address and the reason.
  See [the discovery document](/reference/discovery).
- **The route** serves the page's code release and pictures from your own origin (`/foliwake/code/…`,
  `/foliwake/media/…`), so `script-src 'self'` covers the blocks and the browser never talks to Foliwake.
  It also answers `POST /foliwake/hook` and `GET /foliwake/health`.
- **The page** reads the site page of its path (cached, refreshed every 300 seconds), checks and prepares its body,
  and renders `<FoliwakePage as="article">`. The blocks module comes from the page's own code release
  (`X-Foliwake-Blocks`), so a new release of the site's code needs no rebuild of your app.
  The title is the page's first heading. A missing page shows your not-found page.

`init` never overwrites your files (`--force` rewrites only files it wrote), adds only missing variable names,
writes no secret values, and stops on uncommitted git changes unless you pass `--ignore-git-changes`.
`--dry-run` shows the plan, `--json` prints the result for scripts, `--yes` (or `CI=1`) asks nothing.
`npx @foliwake/next init --check` checks an existing setup. `foliwake next init` runs the same wizard.

## Variables

| Variable | What |
| --- | --- |
| `FOLIWAKE_URL` | the site's live URL; required |
| `FOLIWAKE_PREVIEW_TOKEN` | the site's preview token; turns on reading preview |
| `FOLIWAKE_HOOK_SECRET` | the shared secret of the hook; turns on `/foliwake/hook` |
| `FOLIWAKE_REMOTE` | another overrides file than `./foliwake.remote.json` |

## Change what init chose

### Your own page component (host, events)

```tsx
// app/[...path]/page.tsx
import { createFoliwakePage } from '@foliwake/next/page';
import { FoliwakePage } from '@foliwake/next/client';

const Page = createFoliwakePage({ render: (page) => <FoliwakePage page={page} as="main" />, fallback: <p>…</p> });

export default Page;
export const generateMetadata = Page.generateMetadata;
```

For host members and events, `render` returns your own client component around `<FoliwakePage>`
([Step 6 of the manual setup](/embed/next-manual#step-6-host-and-events) shows one).
`createFoliwakePage` also takes `prepare` (`rewriteLink`, `transform`, `mode`), `mount` and `fallback`.

### Pages under a path

`npx @foliwake/next init --mount /pages` writes `app/pages/[[...path]]/page.tsx` with
`createFoliwakePage({ mount: '/pages' })`: the site's `/help` is your `/pages/help`, and links are rewritten.

### Preview for authors

`npx @foliwake/next init --preview` adds `app/preview/[[...path]]/page.tsx` and turns on preview files in the route,
both behind `isAuthor()` in `foliwake/is-author.ts`:

```ts
// foliwake/is-author.ts: replace it with your sign-in before you deploy.
export function isAuthor(): boolean {
  return process.env.NODE_ENV === 'development';
}
```

It lets everyone in under `next dev` and nobody in production. Preview is read with HTTP Basic, user `preview`,
and the site's preview token in `FOLIWAKE_PREVIEW_TOKEN`. A site admin gets the token with
`foliwake site preview-token --site <site>`, or in the **Preview token** section of the site's settings in the admin;
the request is logged. Never commit the token.

### The hook

A Foliwake server can call your app after every change, once the change is live: the route expires Next's cache
tags of the changed pages. `npx @foliwake/next init --hook` adds `FOLIWAKE_HOOK_SECRET=` to `.env.local`; the
site's admin adds `https://<your app>/foliwake/hook` as the site's app hook with the same secret. Make the
secret without a trailing newline, `openssl rand -hex 32 | tr -d '\n'`; the hook trims surrounding whitespace
and warns once, naming the variable, when it had to. Options:

```ts
// app/foliwake/[...path]/route.ts
import { createFoliwakeHandler } from '@foliwake/next/handler';

export const { GET, HEAD, POST } = createFoliwakeHandler({
  hook: { onDelivery: (payload) => console.log('changed', payload.pages ?? 'everything') },
});
```

### Overrides: `foliwake.remote.json` version 3

Everything is optional; the site's address and hosts always come from discovery.

```json
{
  "$schema": "./node_modules/@foliwake/next/schemas/remote-3.schema.json",
  "version": 3,
  "app": {
    "pages": ["/lessons/**"],
    "revalidate": 60,
    "media": { "base": "https://media.example.org", "transform": "cloudflare-images" }
  }
}
```

| Key | Default |
| --- | --- |
| `app.pages` | `["/**"]`; required when `live.auth` is a service token |
| `app.revalidate` | `300` seconds |
| `app.proxies` | `{ "code": "/foliwake/code", "media": "/foliwake/media" }` |
| `app.media` | the site's media CDN from discovery, if any |
| `app.blocks` | the blocks module the page's code release names |
| `live.auth`, `preview.auth` | none; preview: Basic `preview` with `FOLIWAKE_PREVIEW_TOKEN` |

A version 2 file without `FOLIWAKE_URL` keeps working as it is ([manual setup](/embed/next-manual)).

### Content-Security-Policy

`withFoliwake(config, { csp: { reportUri: '/csp-report' } })` sets a policy on every route; the site's media CDN
is added to `img-src`. See [Step 3 of the manual setup](/embed/next-manual#step-3-next-config-ts).

## Limitations

- One site per app.
- A page's code release names its blocks module only when the site's code declares it: `blocks` in `site.yaml`
  (or `"blocks"` in a hand-written `components/components.json`). Without it pages stay static until you set
  `app.blocks.entry` in the version 3 file. The `create-foliwake` starters ship no blocks module for apps yet.
- `withFoliwake` is required with `FOLIWAKE_URL`: without it the app refuses to start and says so.
- `init` edits `next.config` only when it exports a name or an object literal as an ES module; otherwise it
  prints the lines to add.
- `init` does not fetch the preview token for you; it prints the command a site admin runs.
- The hook is registered on the server by the site's admin; `init` prints what to ask for.
- A page's description is not sent by the site yet, so `generateMetadata` gives the title only.

Something does not work? See [Troubleshooting](/embed/troubleshooting).
