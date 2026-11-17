# foliwake-js

The open-source JavaScript and TypeScript SDK of Foliwake.
Documentation: [sdk.foliwake.dev](https://sdk.foliwake.dev).

Foliwake publishes a site's pages as plain, checked HTML.
A site's blocks (small CSS and JavaScript modules that make parts of a page interactive) live in a Git repository.
The platform turns a commit of that repository into an immutable code release, and every page names its release.
An app can show those pages inside its own UI and mount their blocks from that same release.

This repository holds the tools around the platform: what you use to write and check blocks,
and what you use to embed Foliwake pages in an app.
The platform itself (the engine that renders, publishes and serves pages) is not here.
These packages talk to it over HTTP only and import nothing from it.

## Where to start

**I write blocks for a Foliwake site.**

```sh
npm create foliwake@latest my-site   # a site code repository with a working block
cd my-site
npx @foliwake/site-check             # the same checks the platform runs on every commit
```

Then read [`@foliwake/block-kit`](packages/block-kit/README.md) (`defineBlock`, `html`, the block context)
and [`@foliwake/site-check`](packages/site-check/README.md) (the CLI, its exit codes, `--format github`).

**I embed Foliwake pages in my React or Next.js app.**

```sh
npm install @foliwake/next @foliwake/react @foliwake/server   # Next.js App Router
npm install @foliwake/react @foliwake/server                  # any other React app with a server
```

Start with [`@foliwake/next`](packages/next/README.md) (three files) or [`@foliwake/react`](packages/react/README.md)
with [`@foliwake/server`](packages/server/README.md).
Your app reads pages on its server with a credential and serves their code and pictures from its own origin,
so the browser never talks to Foliwake.

**I use another framework, or none.**

```sh
npm install @foliwake/client @foliwake/server
```

[`@foliwake/client`](packages/client/README.md) mounts a prepared page in any DOM element.
Its README shows a custom element; a Vue or Svelte adapter has the same three calls: mount, update, dispose.

## What works without a Foliwake server

- `create-foliwake`, `@foliwake/site-check` and the types of `@foliwake/block-kit` work offline.
- Pages and block examples are rendered by the platform only.
  The local preview needs the Foliwake CLI, which is not public yet.
- The app packages need a Foliwake site to read pages from.

## Packages

| Package | For | What |
| --- | --- | --- |
| [`create-foliwake`](packages/create-foliwake/README.md) | block authors | `npm create foliwake@latest`: a new site code repository, checked before anything is written |
| [`@foliwake/block-kit`](packages/block-kit/README.md) | block authors | the module blocks import (`defineBlock`, `html`), its types, the browser files of a code release |
| [`@foliwake/site-check`](packages/site-check/README.md) | block authors | the checks the platform runs on a site's code, as a library and a CLI |
| [`@foliwake/next`](packages/next/README.md) | app developers | Next.js App Router adapter: cached read, `<FoliwakeServerPage>`, proxy routes, CSP |
| [`@foliwake/react`](packages/react/README.md) | app developers | `<FoliwakePage>`, `useFoliwakeEvents`: a thin, SSR-safe wrapper of `@foliwake/client` |
| [`@foliwake/server`](packages/server/README.md) | app developers | config, origin client, page check and preparation, code and media proxies, CSP; no framework |
| [`@foliwake/client`](packages/client/README.md) | app developers | framework-free browser client: `mountFoliwakePage`, `createHost`, `subscribeBlockEvents` |
| [`@foliwake/blocks-contract`](packages/blocks-contract/README.md) | both | the types of the blocks contract `foliwake-blocks/2` and the page types the others share |

Each package's README has its purpose, a minimal example, task examples, compatibility and its API.

## Compatibility

| Packages | Origin (`.plain.html`) | Blocks contract | Config | Next | React | Browser (`@foliwake/client`) |
|---|---|---|---|---|---|---|
| 0.4.x | plain/2 (`X-Code-Release` required) | `foliwake-blocks/2` | `foliwake.remote.json` v2 | 16.2.x with `cacheComponents` (tested 16.2.12) | 19.2+ (tested 19.3.0) | ES2022 + dynamic `import()` (tested: Chrome) |

Node.js 22.22 or newer.
The packages share one version and are released together.
While 0.x, a minor may break (each `CHANGELOG.md` marks it **BREAKING**).
Install the same exact version of every `@foliwake/*` package.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build                 # tsc, in dependency order (tools/packages.mjs)
pnpm typecheck             # build + tsc --noEmit of every package
pnpm test                  # build + every test (unit, browser, tarball install)
pnpm packages:reference    # regenerate the API section of each README from the type declarations
pnpm check:tarballs        # pack every package, install the tarballs into a consumer, check their hygiene
```

The browser tests (`test/*-browser.test.js`) drive the system Google Chrome through `playwright-core`.
`FOLIWAKE_TEST_BROWSER_CHANNEL` picks another installed channel.
The API section of each README (between `<!-- api -->` markers) is generated from the type declarations;
`test/packages-reference.test.js` fails when it is stale.

See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute, [RELEASING.md](RELEASING.md) for how releases work,
and [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[Apache-2.0](LICENSE). Each package carries its own copy of the license.
