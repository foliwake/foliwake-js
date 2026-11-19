# The discovery document

A Foliwake site describes itself at `/.well-known/foliwake.json` on each of its hosts, so an app needs only the
site's live URL (`FOLIWAKE_URL`). `withFoliwake` and `createFoliwakeHandler` read it with
`fetchDiscovery` of `@foliwake/server/discovery`.

```json
{
  "foliwake": { "discovery": 1 },
  "site": "my-site",
  "live": { "url": "https://my-site.example.org" },
  "preview": { "url": "https://my-site.preview.example.org", "auth": { "type": "basic", "username": "preview" } },
  "media": { "cdn": "https://media.example.org" },
  "contracts": { "plain": 2, "html": 2, "blocks": 2, "hook": 1 },
  "hooks": { "events": ["delivery.settled", "ping"], "signature": "v1" }
}
```

| Key | What |
| --- | --- |
| `foliwake.discovery` | the format's major; this SDK reads 1 and refuses another |
| `site` | the site's id |
| `live.url` | the live origin; it must be the origin the document was read from |
| `preview` | the preview origin and its sign-in (HTTP Basic, user `preview`, the site's preview token), or null |
| `media.cdn` | the CDN that resizes live pictures (added to the CSP `img-src`), or null |
| `contracts.plain` | the `.plain.html` major; this SDK reads 2 and refuses another |
| `contracts.html`, `contracts.blocks`, `contracts.hook` | the HTML contract, the blocks contract and the hook body majors |
| `hooks` | the events an app hook receives and its signature scheme |

The document never holds tokens, secrets, hook addresses, the engine version, the organisation, pages or release
ids. It is public on live (`Cache-Control: public, max-age=300`) and behind the preview sign-in on preview.

How the SDK reads it: GET with `Accept: application/json`, redirects not followed, 5 seconds per attempt and one
retry on a network failure or a 5xx, at most 16 KiB, `application/json` only. Other origins in it must be https
(http only for loopback hosts) and origins only.

## What a page's code release names

The blocks module of a page is a fact of the page's code release, not of the site, so it comes with each page:
`.plain.html` answers carry `X-Foliwake-Blocks: entry="scripts/blocks.js", contract=2, prefix="demo"` when the
site's code names its blocks module, in `site.yaml`:

```yaml
version: 1
blocks:
  entry: scripts/blocks.js
  contract: 2
  eventPrefix: demo
```

The engine copies it into the `components/components.json` it generates from the block folders. A site with a
hand-written `components/components.json` puts the same object there as `"blocks"` instead (both is an error).
`@foliwake/site-check` checks either with the same rule as the engine, and that the entry file exists.
