# Any framework: one handler

`@foliwake/server/handler` serves every Foliwake route of an app with one function on the Web Fetch API,
`(request: Request) => Promise<Response>`: the code and media proxies, the hook and a health check.
It reads `FOLIWAKE_URL` (and the optional `foliwake.remote.json` version 3) on the first request.

```sh
npm install @foliwake/server
export FOLIWAKE_URL=https://my-site.example.org
```

| Route | What |
| --- | --- |
| `/foliwake/code/…`, `/foliwake/media/…` | a code release's files and hashed pictures, served from your origin |
| `POST /foliwake/hook` | the signed hook a Foliwake server sends after a change (secret in `FOLIWAKE_HOOK_SECRET`) |
| `GET /foliwake/health` | `{ ok, site }` |

The examples below are JavaScript: the frameworks are not dependencies of this repository, so they are not
typechecked here.

Preview is off until you pass your author check as `authorizePreview`; preview files are then read with
`FOLIWAKE_PREVIEW_TOKEN`. `hook: { onDelivery }` lets you expire your own caches after a change.

## Hono

```js
import { Hono } from 'hono';
import { createFoliwakeHandler } from '@foliwake/server/handler';

const foliwake = createFoliwakeHandler();
const app = new Hono();

app.all('/foliwake/*', (c) => foliwake(c.req.raw));

export default app;
```

## Express

Express has no Fetch API handler of its own; `@whatwg-node/server` adapts one.

```js
import express from 'express';
import { createServerAdapter } from '@whatwg-node/server';
import { createFoliwakeHandler } from '@foliwake/server/handler';

const foliwake = createServerAdapter(createFoliwakeHandler());
const app = express();

// Not app.use('/foliwake', …): Express would strip the prefix from the URL the handler sees.
app.use((req, res, next) => (req.path.startsWith('/foliwake/') ? foliwake(req, res) : next()));

app.listen(3000);
```

Pages themselves are read on your server with `readEnvelope` and `preparePage` of `@foliwake/server/page`,
and mounted in the browser with `@foliwake/client` ([Other frameworks, or none](/embed/other-frameworks)).
In Next.js, use [`@foliwake/next`](/embed/next), which wraps this handler with Next's cache.
