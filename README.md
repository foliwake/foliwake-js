# foliwake-js

The JavaScript/TypeScript packages of [Foliwake](https://docs.foliwake.dev): what an app uses to show pages
published by a Foliwake site, with the site's own blocks (interactive components) mounted from the site's code
release; and what a site developer uses to create and check the site's code repository.

| Package | What |
|---|---|
| [`@foliwake/blocks-contract`](packages/blocks-contract/README.md) | types of the blocks contract (`foliwake-blocks/2`) and the page types shared by the other packages; the import map of a code release |
| [`@foliwake/server`](packages/server/README.md) | server toolkit: config v2 (`foliwake.remote.json`), origin client, page read/check/preparation, code and media proxy handlers, CSP, preload hints; Web `Request`/`Response`, no framework |
| [`@foliwake/client`](packages/client/README.md) | framework-free browser client: `mountFoliwakePage`, `createHost`, `subscribeBlockEvents`; the base of every adapter |
| [`@foliwake/react`](packages/react/README.md) | `<FoliwakePage>`, `useFoliwakeEvents`, `FoliwakeProvider`: a thin, SSR-safe wrapper of `@foliwake/client` |
| [`@foliwake/next`](packages/next/README.md) | Next.js App Router adapter: `withFoliwake`, cached envelope read, `<FoliwakeServerPage>`, preview pages, code and media route handlers, CSP header |
| [`@foliwake/site-check`](packages/site-check/README.md) | the checks the platform runs on a site's code repository, as a library and the CLI `npx @foliwake/site-check` |

Documentation: [docs.foliwake.dev](https://docs.foliwake.dev), with the guide
[Embed Foliwake pages in a React or Next app](https://docs.foliwake.dev/guide/embed-in-react) and one reference
page per package (`https://docs.foliwake.dev/reference/packages/<name>`). The Foliwake engine (the CLI and the
server that publishes sites) lives in a separate repository; these packages talk to a Foliwake origin over
HTTP only and import nothing from it.

## Install

From npm, no token and no `.npmrc` needed:

```sh
npm install @foliwake/next          # a Next.js App Router app (brings server, react, client, blocks-contract)
npm install @foliwake/react @foliwake/server   # another React app with a server
npm install @foliwake/client        # any browser app, no framework
```

Each package's README has what it is for, a minimal example, task examples, compatibility and its API.

## Compatibility

| Packages | Origin (`.plain.html`) | Blocks contract | Config | Next | React | Browser (`@foliwake/client`) |
|---|---|---|---|---|---|---|
| 0.3.x | plain/2 (`X-Code-Release`); plain/1 → static body | `foliwake-blocks/2` | `foliwake.remote.json` v2 | 16.2.x with `cacheComponents` (tested 16.2.12) | 19.2+ (tested 19.3.0) | ES2022 + dynamic `import()` (tested: Chrome) |

Node.js 22.22 or newer. The packages share one version and are released together while 0.x; a minor may
break before 1.0 (each `CHANGELOG.md` marks it **BREAKING**). Each app package's `package.json` carries
`"foliwake": { "plain": 2, "blocksContract": 2, "remoteConfig": 2 }`; `@foliwake/site-check` carries the
versions of the site formats it checks (`"htmlContract": 2`, …).

## Development

```sh
pnpm install --frozen-lockfile
pnpm build                 # tsc, in dependency order (tools/packages.mjs): blocks-contract → site-check → …
pnpm typecheck             # build + tsc --noEmit of every package
pnpm test                  # build + every test (unit, browser, tarball install)
pnpm packages:reference    # regenerate the API section of each README from the type declarations
pnpm check:tarballs        # pack them all into .tarballs/, install them into a consumer, check their hygiene
```

The browser tests (`test/*-browser.test.js`) drive the system Google Chrome through `playwright-core`
(no browser download); `FOLIWAKE_TEST_BROWSER_CHANNEL` picks another installed channel. The API section of
each README (between `<!-- api -->` markers) is generated; `test/packages-reference.test.js` fails when it is
stale. The hand-written part (between `<!-- usage -->` markers) is the source of the package's page on
docs.foliwake.dev, which copies it from the published package.

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## Releasing (the owner releases; agents never tag or publish)

- Registry: npm (`https://registry.npmjs.org`), public, scope `@foliwake` (npm organisation `foliwake`).
  `publishConfig` is `{ "access": "public", "provenance": true }`; no custom registry.
- Tag format: **`v<version>`** (for example `v0.3.0`): one tag for all packages, which share a version. A
  release candidate `v0.3.0-rc.1` is published under the npm dist-tag `next` (never `latest`); a final version
  under `latest` (`tools/packages-version.mjs --dist-tag`).
- Workflow: [`.github/workflows/publish.yml`](.github/workflows/publish.yml).
  - `pack` (no token, `contents: read`): checks that the versions are one 0.x version equal to the tag
    (`tools/packages-version.mjs`), builds, typechecks, runs the tests, packs the tarballs with `pnpm pack`
    (which rewrites `workspace:*` to the exact version), installs exactly those files into a throwaway
    consumer and uses them, checks their hygiene (`tools/check-package-tarballs.mjs` with
    `tools/package-tarball-hygiene.mjs`: only `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `NOTICE`,
    `dist/**/*.js|.d.ts`, `schemas/*.schema.json`; no credentials files or secrets, no local paths, no
    internal hosts, no source maps), runs `npm publish --dry-run` on each tarball and uploads them.
  - `publish` (only on a tag `v<version>`): runs in the GitHub environment `packages-publish`
    (`contents: read`, `id-token: write` for provenance), refuses a private repository, checks that the tag
    points at a commit on `main`, refuses a version that exists, and publishes exactly the checked tarballs
    (checksums) in dependency order with `npm publish --provenance --access public --tag <dist-tag>` and the
    secret `NPM_TOKEN`. The package list and order: `tools/packages.mjs`.
  - Dry run: Actions → "Publish" → Run workflow on `main` with `dry-run` checked (the default); it runs `pack`
    only. Locally: `pnpm check:tarballs`, then `npm publish .tarballs/<tarball> --dry-run`.
- To release:
  1. In a pull request: bump `version` in every `package.json` of `tools/packages.mjs` together
     (`test/packages-dist.test.js` refuses a mix), add the version's entry to each `CHANGELOG.md`, update the
     compatibility table above, run `pnpm packages:reference`. Merge to `main` (CI must pass).
  2. Tag that `main` commit and push the tag: `git tag v<version> <commit>` and `git push origin v<version>`.
     The push starts the workflow.
  3. Approve the `publish` job (environment `packages-publish`).
- Owner setup (once, before the first publish):
  1. npm: in the `foliwake` organisation, a **granular access token** with read and write on packages, limited
     to the `@foliwake` scope, with a short expiry (renew before a release). Alternative: npm trusted
     publishing (OIDC) for this repository and `publish.yml`, which needs no token; the workflow would then drop
     `NODE_AUTH_TOKEN`.
  2. GitHub: Settings → Environments → `packages-publish`: required reviewer = the owner, deployment branches
     and tags = selected, tag rule `v*`; the token as the environment secret **`NPM_TOKEN`**. Settings → Rules:
     a tag ruleset on `v*` that lets only the owner create, update or delete such tags, and a branch ruleset on
     `main` (pull requests, the `CI` check required).

## License

[Apache-2.0](LICENSE). Each package carries its own copy of the license.
