# @foliwake/server

Server toolkit for apps that show Foliwake pages. Web `Request`/`Response`, no framework, Node ≥ 22.

| Entry | Exports |
|---|---|
| `./config` | `parseFoliwakeConfig`, `loadFoliwakeConfig`, `clientSettings`, `pageAllowed`, `FoliwakeConfigError` (config v2, schema `./schemas/remote-2.schema.json`) |
| `./origin` | `createOriginClient(config, env)`: the only place a password is read (per request, by the variable name in the config) |
| `./page` | `readEnvelope(config, client, site, channel, path)` (primitive inputs: safe in a cache function), `preparePage(config, envelope, { rewriteLink, transform, mode })`, `FoliwakePageError` |
| `./html` | `checkPlainBody`, `checkBody`, `serialize`, `srcsetCandidates` (the strict body check) |
| `./handlers` | `codeHandler`, `mediaHandler` (`{ authorizePreview }` required) |
| `./csp` | `foliwakeCsp({ strategy: 'self-inline', mediaBase, reportUri, extra, dev })`; `mediaBase` (https; origin only) is the media host, or the site's image CDN when it uses `media.resize: "cdn"` |
| `./preload` | `preloadHints(config, client, page)`: modulepreload / preload hints of a page's blocks |

```ts
import { loadFoliwakeConfig } from '@foliwake/server/config';
import { createOriginClient } from '@foliwake/server/origin';
import { readEnvelope, preparePage } from '@foliwake/server/page';
import { codeHandler } from '@foliwake/server/handlers';

const config = await loadFoliwakeConfig();            // FOLIWAKE_REMOTE or ./foliwake.remote.json
const client = createOriginClient(config, process.env);
const page = preparePage(config, await readEnvelope(config, client, config.site, 'live', '/lessons/a'));
const code = codeHandler(config, client, { authorizePreview: false }); // (request, { path }) => Response
```

Guarantees: bodies are checked before and after the app's transform (no scripts, styles, frames, inline SVG
or MathML, `on*`, `javascript:`; srcset and entities parsed like a browser), and what is returned is
serialised from the checked tree. Origin responses are size-limited while streaming (body 2 MB, code 5 MB,
media 25 MB). Preview is never served without `authorizePreview`, and preview answers are `private, no-store`.
Preview pictures are never addressed through the public media host. Credentials never appear in messages.

Guide: [Embed Foliwake pages in a React or Next app](https://github.com/adjioev/foliwake/blob/main/website/guide/embed-in-react.md). Apache-2.0.
