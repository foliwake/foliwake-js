# Reference

One page per package, copied from the README that ships with it on npm.
The API section of each page is generated from the package's type declarations.

## For block authors

| Package | What |
| --- | --- |
| [`create-foliwake`](/reference/packages/create-foliwake) | `npm create foliwake@latest`: a new site code repository |
| [`@foliwake/block-kit`](/reference/packages/block-kit) | `defineBlock`, `html`, the block context and their types |
| [`@foliwake/site-check`](/reference/packages/site-check) | the platform's checks of a site's code, as a CLI and a library |

## For app developers

| Package | What |
| --- | --- |
| [`@foliwake/next`](/reference/packages/next) | Next.js App Router adapter |
| [`@foliwake/react`](/reference/packages/react) | `<FoliwakePage>` and `useFoliwakeEvents` |
| [`@foliwake/server`](/reference/packages/server) | config, origin client, page preparation, proxies, CSP |
| [`@foliwake/client`](/reference/packages/client) | framework-free browser client |

## For both

| Package | What |
| --- | --- |
| [`@foliwake/blocks-contract`](/reference/packages/blocks-contract) | the types of `foliwake-blocks/2` and the shared page types |

## For the command line and tools

| Package | What |
| --- | --- |
| [`@foliwake/cli`](/reference/packages/cli) | `foliwake` without the engine: sign in, link a folder (`connect`), run commands on a server |
| [`@foliwake/core-contract`](/reference/packages/core-contract) | the procedures, types and error codes of core over HTTP |
| [`foliwake`](/reference/packages/foliwake) | the short name of `@foliwake/cli`, for `npx foliwake` |

## Versions

All packages share one version and are released together.
Install the same exact version of every `@foliwake/*` package you use.
While 0.x, a minor version may break; each package's `CHANGELOG.md` marks it **BREAKING**.
