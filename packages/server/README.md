# @foliwake/server

<!-- usage -->

`@foliwake/server` is the server toolkit for any app that shows Foliwake pages, with no framework
dependency: Web `Request`/`Response` and plain functions. It parses the app's `foliwake.remote.json`, reads a
page's body from the site's live or preview origin with the credential, checks and prepares it per request,
serves the page's code release and pictures through your app's origin (proxies), builds a
Content-Security-Policy, and computes preload hints. `@foliwake/next` is built on it; use this package
directly with another server framework (a Vite or Remix server, Hono, Express with Web adapters, a worker).

| Entry | What |
| --- | --- |
| `@foliwake/server/config` | `loadFoliwakeConfig`, `parseFoliwakeConfig`, `clientSettings`, `pageAllowed`, `FoliwakeConfigError` |
| `@foliwake/server/origin` | `createOriginClient`: the only place a password is read (per request, from the variable the config names) |
| `@foliwake/server/page` | `readEnvelope` (primitive inputs: safe inside a cache function), `preparePage`, `FoliwakePageError` |
| `@foliwake/server/handlers` | `codeHandler`, `mediaHandler`: the code and media proxies |
| `@foliwake/server/html` | the strict body check: `checkPlainBody`, `checkBody`, `serialize`, `srcsetCandidates` |
| `@foliwake/server/csp` | `foliwakeCsp` |
| `@foliwake/server/preload` | `preloadHints`: modulepreload and stylesheet hints for a page's blocks |
| `@foliwake/server/schemas/remote-2.schema.json` | the JSON Schema of the config file |

## Install

The packages are published to GitHub Packages under the `@foliwake` scope. Add an `.npmrc` to your app:

```ini
@foliwake:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN` is a GitHub personal access token (classic) with `read:packages`; fine-grained tokens do
not work with this registry. Install an exact version, the same for every `@foliwake/*` package:

```bash
pnpm add @foliwake/server@0.1.0
```

The config file sits in the app's root and holds no secrets, only the names of the variables with passwords:

```json
{
  "$schema": "./node_modules/@foliwake/server/schemas/remote-2.schema.json",
  "version": 2,
  "site": "mysite",
  "live": { "url": "https://mysite.example.org" },
  "preview": { "url": "https://preview.mysite.example.org", "auth": { "type": "basic", "username": "app", "passwordEnv": "MYSITE_PREVIEW_PASSWORD" } },
  "app": {
    "pages": ["/**"],
    "proxies": { "code": "/foliwake-code", "media": "/foliwake-media", "pages": null },
    "blocks": { "entry": "scripts/blocks.js", "contract": "foliwake-blocks/2", "eventPrefix": "demo" },
    "revalidate": 300
  }
}
```

## Minimal example

```ts
import { loadFoliwakeConfig } from '@foliwake/server/config';
import { createOriginClient } from '@foliwake/server/origin';
import { preparePage, readEnvelope } from '@foliwake/server/page';

const config = await loadFoliwakeConfig(); // FOLIWAKE_REMOTE, else ./foliwake.remote.json
const client = createOriginClient(config, process.env);

const envelope = await readEnvelope(config, client, config.site, 'live', '/lessons/a'); // cacheable
const page = preparePage(config, envelope); // per request: checked, rewritten, serialisable
console.log(page.identity, page.blocks);
```

## Examples

### A page endpoint for the browser, with a cache of envelopes

Cache only the envelope (what the origin answered) and prepare per request, so your callbacks (`rewriteLink`,
`transform`) always run on the current code. The prepared page is what `@foliwake/client` or
`@foliwake/react` mount.

```ts
import { loadFoliwakeConfig } from '@foliwake/server/config';
import { createOriginClient } from '@foliwake/server/origin';
import { FoliwakePageError, preparePage, readEnvelope, type PageEnvelope } from '@foliwake/server/page';
import { preloadHints } from '@foliwake/server/preload';

const config = await loadFoliwakeConfig();
const client = createOriginClient(config, process.env);
const cache = new Map<string, { at: number; envelope: PageEnvelope }>();

async function liveEnvelope(path: string): Promise<PageEnvelope> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < config.app!.revalidate * 1000) return hit.envelope;
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
    if (error instanceof FoliwakePageError && (error.kind === 'not_found' || error.kind === 'not_allowed')) return new Response(null, { status: 404 });
    throw error;
  }
}
```

### Code and media proxies

Mount the handlers under the prefixes of `app.proxies` and pass them the path segments after the prefix. They
serve only files of a `cd_…` code release and hashed pictures, add the credential on the server and forward
nothing from the browser. Live files are cached for a year (immutable); preview answers are
`private, no-store` and need `authorizePreview`.

```ts
import { loadFoliwakeConfig } from '@foliwake/server/config';
import { codeHandler, mediaHandler } from '@foliwake/server/handlers';
import { createOriginClient } from '@foliwake/server/origin';

const config = await loadFoliwakeConfig();
const client = createOriginClient(config, process.env);
const isAuthor = async (request: Request) => (request.headers.get('cookie') ?? '').includes('role=author'); // your sign-in
const code = codeHandler(config, client, { authorizePreview: isAuthor });
const media = mediaHandler(config, client, { authorizePreview: isAuthor });

/** Route requests under /foliwake-code/ and /foliwake-media/ (app.proxies) to the handlers. */
export async function proxies(request: Request): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const segments = (prefix: string) => pathname.slice(prefix.length + 1).split('/').filter(Boolean);
  if (pathname.startsWith(`${config.app!.proxies.code}/`)) return code(request, { path: segments(config.app!.proxies.code) });
  if (pathname.startsWith(`${config.app!.proxies.media}/`)) return media(request, { path: segments(config.app!.proxies.media) });
  return null;
}
```

### CSP and browser settings

```ts
import { clientSettings, loadFoliwakeConfig } from '@foliwake/server/config';
import { foliwakeCsp } from '@foliwake/server/csp';

const config = await loadFoliwakeConfig();

// One header value for every route: blocks load from your own origin, so no Foliwake host is named.
export const csp = foliwakeCsp({
  strategy: 'self-inline',
  mediaBase: config.app?.media?.base ?? null,
  reportUri: '/csp-report',
  dev: process.env.NODE_ENV === 'development',
});

// The only part of the config a browser may see: site, proxy prefixes, blocks contract and event prefix.
export const settingsForBrowser = clientSettings(config);
```

## Compatibility

| | |
| --- | --- |
| Node.js | 22.22 or newer (Web `fetch`, `Request`, `Response`, streams) |
| Foliwake origin | sends `X-Code-Release` with `.plain.html` (plain/2); a plain/1 origin gives bodies without blocks |
| Config | `foliwake.remote.json` version 2 (version 1 files are refused) |
| Blocks contract | `foliwake-blocks/2` |

## Good to know

- Bodies are checked before and after your `transform`: no scripts, styles, frames, inline SVG or MathML, no
  `on…` attributes or `javascript:` URLs; `srcset` and entities are parsed like a browser does. What is
  returned is serialised from the checked tree. A refused body throws `FoliwakePageError` with kind `invalid`.
- Origin responses are size-limited while streaming (body 2 MB, code 5 MB, media 25 MB); requests time out
  after 10 s.
- Credentials never appear in messages; a missing password variable is a `FoliwakeConfigError` that names
  the variable, not its value. The password is read at each request, so a rotated secret works without a
  restart.
- `preparePage` leaves `page.preload` empty; `preloadHints` fills it from the release's
  `components/components.json` (only blocks that declare a `.js` or `.css` get hints).

## Guides

- [Embed Foliwake pages in a React or Next app](https://docs.foliwake.dev/guide/embed-in-react): config keys,
  proxies, caching and troubleshooting.
- [Configuration and storage](https://docs.foliwake.dev/guide/configuration-storage)

License: Apache-2.0.

<!-- usagestop -->

## API

<!-- api -->

<!-- Generated by `pnpm packages:reference` from the type declarations; do not edit by hand. -->

### `@foliwake/server/config`

**Functions and components**

#### `appOf()`

The app settings; throws when the config has none.

```ts
function appOf(config: FoliwakeAppConfig): FoliwakeAppSettings
```

**Returns** `FoliwakeAppSettings`

#### `checkEnvName()`

Validates an environment variable NAME (never a value).

```ts
function checkEnvName(value: unknown, where: string, extra?: ParseOptions['envNameProblem']): string
```

**Returns** `string`

#### `checkUsername()`

Validates a Basic user name (no `:` or control characters, at most 128 characters).

```ts
function checkUsername(value: unknown, where: string): string
```

**Returns** `string`

#### `clientSettings()`

The explicit browser projection: nothing else of the config reaches a browser.

```ts
function clientSettings(config: FoliwakeAppConfig): ClientSettings
```

**Returns** `ClientSettings`

#### `configFilePath()`

Which file: an explicit `file` beats FOLIWAKE_REMOTE beats `<cwd>/foliwake.remote.json`.

```ts
function configFilePath(opts?: {
    cwd?: string;
    file?: string;
    env?: NodeJS.ProcessEnv;
}): string
```

**Returns** `string`

#### `endpointOf()`

The endpoint of a channel; a missing one is an error, never replaced by the other channel.

```ts
function endpointOf(config: FoliwakeAppConfig, channel: ChannelName): FoliwakeEndpoint
```

**Returns** `FoliwakeEndpoint`

#### `isLoopbackName()`

True for 127.x, localhost, *.localhost and ::1.

```ts
function isLoopbackName(hostname: string): boolean
```

**Returns** `boolean`

#### `loadFoliwakeConfig()`

Reads and parses the config file (see configFilePath).

```ts
function loadFoliwakeConfig(opts?: {
    cwd?: string;
    file?: string;
    env?: NodeJS.ProcessEnv;
} & Omit<ParseOptions, 'file'>): Promise<FoliwakeAppConfig>
```

**Returns** `Promise<FoliwakeAppConfig>`

#### `pageAllowed()`

Whether the app may read this page path (`app.pages`).

```ts
function pageAllowed(config: FoliwakeAppConfig, pagePath: string): boolean
```

**Returns** `boolean`

#### `parseFoliwakeConfig()`

Parses the text of a version 2 config. Throws FoliwakeConfigError with a message that names the field.

```ts
function parseFoliwakeConfig(text: string, opts?: ParseOptions): FoliwakeAppConfig
```

**Returns** `FoliwakeAppConfig`

#### `parseRemoteUrl()`

A site origin: https (http only for loopback), no credentials, path, query or fragment.

```ts
function parseRemoteUrl(value: unknown, where: string): string
```

**Returns** `string`

**Classes**

#### `FoliwakeConfigError`

A configuration problem; the message is shown as is (it never contains a secret).

```ts
class FoliwakeConfigError extends Error
```

| Member | Type | Description |
| --- | --- | --- |
| `name` | `string` |  |

**Constants**

#### `CHANNELS`

The channels a config can name.

```ts
const CHANNELS: readonly ChannelName[]
```

#### `CONFIG_ENV`

The environment variable that names another config file.

```ts
const CONFIG_ENV = "FOLIWAKE_REMOTE"
```

#### `CONFIG_FILE`

The default config file name, looked up in the current directory.

```ts
const CONFIG_FILE = "foliwake.remote.json"
```

**Interfaces**

#### `FoliwakeAppConfig`

A parsed and validated `foliwake.remote.json` (version 2). It holds credential variable names, never secrets.

```ts
interface FoliwakeAppConfig
```

| Member | Type | Description |
| --- | --- | --- |
| `version` | `2` |  |
| `site` | `string` |  |
| `live` | `FoliwakeEndpoint \| null` |  |
| `preview` | `FoliwakeEndpoint \| null` |  |
| `app` | `FoliwakeAppSettings \| null` | Null only when parsed with `requireApp: false` (the engine CLI). |
| `from` | `string` | Where the config came from, for messages. |

#### `FoliwakeAppSettings`

The `app` part of the config, with defaults applied.

```ts
interface FoliwakeAppSettings
```

| Member | Type | Description |
| --- | --- | --- |
| `pages` | `readonly string[]` | Page globs the app may read. |
| `proxies` | `{ code: string; media: string; pages: null; }` | App-origin URL prefixes of the proxies. |
| `blocks` | `{ entry: string \| null; contract: string; major: number; eventPrefix: string; }` | Where `mountBlocks` lives in a code release; null: bodies stay static. |
| `media` | `{ base: string; transform: 'cloudflare-images' \| null; } \| null` | Live media through a transforming host; null: media through the proxy. |
| `revalidate` | `number` | Seconds before a cached envelope is stale (stale-while-revalidate). |

#### `FoliwakeEndpoint`

A channel's origin and its optional credential.

```ts
interface FoliwakeEndpoint
```

| Member | Type | Description |
| --- | --- | --- |
| `origin` | `string` | Origin only: scheme, host, port. |
| `auth` | `RemoteAuth \| null` |  |

#### `ParseOptions`

Options of `parseFoliwakeConfig`.

```ts
interface ParseOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `file?` | `string` | For messages (default foliwake.remote.json). |
| `requireApp?` | `boolean` | Refuse a file without `app` (default true; the CLI passes false). |
| `envNameProblem?` | `(name: string, what: string) => string \| null` | An additional rule for credential variable names (the engine CLI passes its own). |

#### `RemoteAuth`

HTTP Basic credentials: a user name and the NAME of the variable holding the password.

```ts
interface RemoteAuth
```

| Member | Type | Description |
| --- | --- | --- |
| `type` | `'basic'` |  |
| `username` | `string` |  |
| `passwordEnv` | `string` |  |

**Also exported** (documented where they are defined)

- from `@foliwake/blocks-contract/page`: `ClientSettings`

### `@foliwake/server/origin`

**Functions and components**

#### `createOriginClient()`

The client for the config's origins. The password is read from `env[passwordEnv]` at each request (a rotated secret takes effect without a restart) and goes only into the Authorization header.

```ts
function createOriginClient(config: FoliwakeAppConfig, env?: NodeJS.ProcessEnv, opts?: OriginClientOptions): OriginClient
```

| Parameter | Type | Description |
| --- | --- | --- |
| `config` | `FoliwakeAppConfig` |  |
| `env?` | `NodeJS.ProcessEnv` | Where passwords are read (default `process.env`). |
| `opts?` | `OriginClientOptions` |  |

**Returns** `OriginClient`

**Interfaces**

#### `OriginClient`

Requests to the configured live and preview origins, with the credential added per request.

```ts
interface OriginClient
```

| Member | Type | Description |
| --- | --- | --- |
| `readonly config` | `FoliwakeAppConfig` |  |
| `originOf()` | `(channel: ChannelName) => string` | The origin of a channel (for messages and loopback checks). |
| `request()` | `(channel: ChannelName, path: string, opts?: OriginRequestOptions) => Promise<Response>` | GET/HEAD `<origin><path>`; `redirect: 'manual'`, 10 s timeout unless `signal` is given. |

#### `OriginClientOptions`

Options of `createOriginClient`.

```ts
interface OriginClientOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `fetch?` | `typeof fetch` | A fetch implementation (tests); default globalThis.fetch. |
| `timeoutMs?` | `number` |  |

#### `OriginRequestOptions`

Options of one origin request.

```ts
interface OriginRequestOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `method?` | `'GET' \| 'HEAD'` |  |
| `signal?` | `AbortSignal` |  |
| `headers?` | `Record<string, string>` | Only these headers are sent (never a browser's). |

### `@foliwake/server/page`

**Functions and components**

#### `blocksUrlOf()`

The same-origin URL of the blocks module, or null (no entry, no code release, or `local` from a remote origin).

```ts
function blocksUrlOf(config: FoliwakeAppConfig, channel: ChannelName, codeRelease: CodeReleaseId | null): {
    base: string;
    url: string;
} | null
```

**Returns** `{ base: string; url: string; } \| null`

#### `plainPath()`

The origin URL path of a page's body (`/` → `/index.plain.html`).

```ts
function plainPath(pagePath: string): string
```

**Returns** `string`

#### `preparePage()`

Per request, after the cache: check → rewrite media/links → transform → check again → serialise.

```ts
function preparePage(config: FoliwakeAppConfig, envelope: PageEnvelope, opts?: PrepareOptions): FoliwakePageData
```

| Parameter | Type | Description |
| --- | --- | --- |
| `config` | `FoliwakeAppConfig` |  |
| `envelope` | `PageEnvelope` | What readEnvelope (or a cached copy of it) returned. |
| `opts?` | `PrepareOptions` |  |

**Returns** `FoliwakePageData`: The serialisable page for a client component (`preload` is empty; readPage of the Next package fills it). Throws FoliwakePageError('invalid') when the body or the transform's output is refused.

#### `readEnvelope()`

Reads `<path>.plain.html` from the channel's origin. Primitive inputs only, no callbacks and no signal (an internal 10 s timeout), so it can run inside a cache function. Refuses paths outside `app.pages`.

```ts
function readEnvelope(config: FoliwakeAppConfig, client: OriginClient, site: string, channel: ChannelName, path: string): Promise<PageEnvelope>
```

| Parameter | Type | Description |
| --- | --- | --- |
| `config` | `FoliwakeAppConfig` |  |
| `client` | `OriginClient` |  |
| `site` | `string` | The config's site (`config.site`); another site is refused. |
| `channel` | `ChannelName` |  |
| `path` | `string` | The page path (`/`, `/lessons/a`). |

**Returns** `Promise<PageEnvelope>`: The envelope; throws FoliwakePageError (`not_found`, `not_allowed`, `origin`, `unauthorized`, …).

**Classes**

#### `FoliwakePageError`

A page that cannot be shown. `status`: the origin's HTTP status when there was one.

```ts
class FoliwakePageError extends Error
new FoliwakePageError(kind: PageErrorKind, message: string, opts?: {
        status?: number;
        cause?: unknown;
    })
```

| Member | Type | Description |
| --- | --- | --- |
| `name` | `string` |  |
| `readonly kind` | `PageErrorKind` |  |
| `readonly status?` | `number` |  |

**Interfaces**

#### `PrepareOptions`

Options of `preparePage`.

```ts
interface PrepareOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `mode?` | `string` | The site's mode of the page (a token, `[a-z][a-z0-9-]`, at most 32 characters), given to the blocks as `host.mode`; absent → none. `exam` is refused: the assessment extension's exam needs answers stripped by the origin, which does not exist yet, so an exam body would carry its answers. |
| `rewriteLink?` | `(href: string) => string` | Root-relative links (`/x`) of `<a href>`; returns the app's URL. |
| `transform?` | `(html: string, envelope: PageEnvelope) => string` | The app's own change of the body (allow-list, artwork, …); its output is checked again. |

**Types**

#### `PageErrorKind`

Why a page cannot be shown (`FoliwakePageError.kind`).

```ts
type PageErrorKind = 'not_found' | 'not_allowed' | 'origin' | 'invalid' | 'unauthorized' | 'too_large'
```

**Also exported** (documented where they are defined)

- from `@foliwake/blocks-contract/import-map`: `pageImportMap`
- from `@foliwake/blocks-contract/page`: `FoliwakePageData`, `PageEnvelope`

### `@foliwake/server/handlers`

**Functions and components**

#### `codeHandler()`

`GET|HEAD <proxies.code>/[preview/]<cd>/<path inside the code release>`.

```ts
function codeHandler(config: FoliwakeAppConfig, client: OriginClient, opts: ProxyOptions): Handler
```

**Returns** `Handler`

#### `mediaHandler()`

`GET|HEAD <proxies.media>/[preview/]<sha256>.<ext>`: images only, one hashed segment.

```ts
function mediaHandler(config: FoliwakeAppConfig, client: OriginClient, opts: ProxyOptions): Handler
```

**Returns** `Handler`

**Interfaces**

#### `ProxyOptions`

Options of `codeHandler` and `mediaHandler`.

```ts
interface ProxyOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `authorizePreview` | `AuthorizePreview` | The app's author check for `preview/…` requests, or `false` to answer them 404. Required. |

**Types**

#### `AuthorizePreview`

The app's author check for preview requests, or `false` (preview answers 404).

```ts
type AuthorizePreview = ((request: Request) => boolean | Promise<boolean>) | false
```

#### `Handler`

A proxy handler: the request and the path segments after the proxy prefix.

```ts
type Handler = (request: Request, params: {
    path: string[];
}) => Promise<Response>
```

### `@foliwake/server/html`

**Functions and components**

#### `checkBody()`

Parses and checks a body; returns the checked tree. Throws FoliwakePageError('invalid').

```ts
function checkBody(html: string, pagePath?: string): HtmlNode[]
```

**Returns** `HtmlNode[]`

#### `checkPlainBody()`

Checks a body (the strict body check); throws FoliwakePageError('invalid').

```ts
function checkPlainBody(html: string, pagePath?: string): void
```

**Returns** `void`

#### `componentNames()`

Distinct `data-component` names, sorted.

```ts
function componentNames(nodes: readonly HtmlNode[]): string[]
```

**Returns** `string[]`

#### `elements()`

Every element below `nodes`, depth first.

```ts
function elements(nodes: readonly HtmlNode[]): Generator<HtmlElement>
```

**Returns** `Generator<HtmlElement>`

#### `parseStrict()`

Parses a body strictly. Comments are dropped; a doctype or processing instruction is an error.

```ts
function parseStrict(html: string): HtmlNode[]
```

**Returns** `HtmlNode[]`

#### `sanitizedHtml()`

The checked body, serialised from its tree.

```ts
function sanitizedHtml(nodes: readonly HtmlNode[]): string
```

**Returns** `string`

#### `serialize()`

Serialises the tree as HTML (the WHATWG fragment serialisation rules for the elements a body may hold).

```ts
function serialize(nodes: readonly HtmlNode[]): string
```

**Returns** `string`

#### `srcsetCandidates()`

Splits a srcset into candidates: the URL ends at whitespace; descriptors run to the next comma.

```ts
function srcsetCandidates(srcset: string): {
    url: string;
    descriptor: string;
}[]
```

**Returns** `{ url: string; descriptor: string; }[]`

#### `urlProblem()`

Why a URL value is not allowed for this element/attribute, or null. Values are entity-decoded already.

```ts
function urlProblem(element: string, attribute: string, value: string, pagePath?: string): string | null
```

**Returns** `string \| null`

**Classes**

#### `HtmlParseError`

A body that cannot be parsed strictly.

```ts
class HtmlParseError extends Error
```

| Member | Type | Description |
| --- | --- | --- |
| `name` | `string` |  |

**Constants**

#### `COMPONENT_NAME`

A valid `data-component` name.

```ts
const COMPONENT_NAME: RegExp
```

#### `REFUSED_ELEMENTS`

Elements a body may not hold (incl. foreign content: no inline SVG or MathML in 0.1). `<form>` is allowed only as the engine writes it for the question block: an explicit `method="dialog"`, no `action`, `target` or `enctype`; no control may override the submission (`formmethod`, `formaction`, `formtarget`, `formenctype`) or associate itself with another form (`form`). Such a form closes a dialog at most; it submits nowhere.

```ts
const REFUSED_ELEMENTS: ReadonlySet<string>
```

**Types**

#### `HtmlElement`

An element of a parsed body.

```ts
type HtmlElement = {
    type: 'tag';
    name: string;
    attribs: Record<string, string>;
    children: HtmlNode[];
}
```

#### `HtmlNode`

A node of a parsed body.

```ts
type HtmlNode = HtmlText | HtmlElement
```

#### `HtmlText`

A text node of a parsed body.

```ts
type HtmlText = {
    type: 'text';
    data: string;
}
```

### `@foliwake/server/csp`

**Functions and components**

#### `foliwakeCsp()`

The policy as one header value.

```ts
function foliwakeCsp(opts: CspOptions): string
```

**Returns** `string`

**Constants**

#### `REACT_SHELL_SCRIPT`

React DOM 19.2's inline `requestAnimationFrame(function(){$RT=performance.now()});` in PPR static shells.

```ts
const REACT_SHELL_SCRIPT = "requestAnimationFrame(function(){$RT=performance.now()});"
```

#### `REACT_SHELL_SCRIPT_HASH`

The CSP hash source of `REACT_SHELL_SCRIPT` (used by the `nonce` strategy).

```ts
const REACT_SHELL_SCRIPT_HASH = "'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs='"
```

**Interfaces**

#### `CspOptions`

Options of `foliwakeCsp`.

```ts
interface CspOptions
```

| Member | Type | Description |
| --- | --- | --- |
| `strategy` | `'self-inline' \| 'nonce'` | `self-inline` (recommended; works with partial prerendering) or `nonce` (experimental, not recommended). |
| `nonce?` | `string` | Required with 'nonce'. |
| `mediaBase?` | `string \| null` | The media host whose pictures pages show: `app.media.base` (live pictures through a transforming host), or the site's own CDN when the site resizes images on one (`media.resize: "cdn"`, whose `cdnBase` is in every live `srcset`). An https address; only its origin (scheme and host) is added to `img-src`. |
| `dev?` | `boolean` | Development: adds 'unsafe-eval' (React's debugging) and websocket connections for HMR. |
| `reportUri?` | `string` | Where browsers report violations (`report-uri`). |
| `extra?` | `Partial<Record<string, string[]>>` | More sources per directive, e.g. { 'connect-src': ['https://api.example.org'] }. |

### `@foliwake/server/preload`

**Functions and components**

#### `clearPreloadCache()`

Forgets every remembered code file (tests).

```ts
function clearPreloadCache(): void
```

**Returns** `void`

#### `codePath()`

A path inside the code release the proxy would serve, or null.

```ts
function codePath(relative: string): string | null
```

**Returns** `string \| null`

#### `preloadHints()`

Hints for a prepared page: modulepreload for its modules, preload as=style for its block stylesheets.

```ts
function preloadHints(config: FoliwakeAppConfig, client: OriginClient, page: FoliwakePageData): Promise<PreloadHint[]>
```

**Returns** `Promise<PreloadHint[]>`

#### `resolveInRelease()`

Resolves `specifier` against the module at `from` (both inside the release), or null when it leaves it.

```ts
function resolveInRelease(from: string, specifier: string): string | null
```

**Returns** `string \| null`

#### `staticImports()`

The relative static import specifiers of an ES module's text, and `foliwake`.

```ts
function staticImports(source: string): string[]
```

**Returns** `string[]`

**Also exported** (documented where they are defined)

- from `@foliwake/blocks-contract/page`: `PreloadHint`

### `@foliwake/server/schemas/remote-2.schema.json`

A file, not a module: `schemas/remote-2.schema.json` in the package.

<!-- apistop -->
