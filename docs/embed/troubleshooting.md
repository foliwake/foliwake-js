# Troubleshooting

| What you see | What to check |
| --- | --- |
| The build fails with a message about `foliwake.remote.json` | the named field; the file must be version 2 with `site`, and the proxy prefixes must not collide |
| "… needs the password in the environment variable X" | set `X` in the environment of the app's server, not in the file |
| "The origin answered without X-Code-Release" | the origin is not a plain/2 Foliwake origin: every `.plain.html` must carry `X-Code-Release` |
| Blocks: `static`, `NO_BLOCKS_ENTRY` | the config names no blocks module: set `app.blocks.entry` |
| Blocks: `static`, `BLOCKS_CONTRACT_UNSUPPORTED` | the site's blocks module exports another `BLOCKS_CONTRACT.major` than `app.blocks.contract` |
| Blocks: `static`, `BLOCKS_MODULE_FAILED` | `app.blocks.entry` is not in the code release, or it throws on import; open `/foliwake-code/<cd>/<entry>` |
| `EVENT_PREFIX_MISMATCH` | the blocks module's `BLOCKS_CONTRACT.eventPrefix` differs from `app.blocks.eventPrefix`; the module's wins |
| The not-found page | the path is outside `app.pages`, or the page is not published on that channel |
| "The page body was refused: …" | the body, or your `transform`'s output, has something the check refuses; the message names it |
| CSP errors in the console | the block code uses `eval`, inline `<script>` or `<style>`, or another origin |
| Blocks fail to import `@foliwake/block-kit` | your own code proxy must serve the release's `_foliwake/` folder too |
| Live pictures blocked by CSP | the site resizes images on a CDN: name it as `app.media` with `"transform": null` |
| Pictures missing in preview | `authorizePreview` must say yes for the signed-in author |
| A 404 for `components/<name>/<name>.css` | a block without a stylesheet; harmless. Render the `as: 'style'` hints of `page.preload` instead |
| A block's stylesheet loads but part of it (a border, a color) is missing | the site's variables (`--color-accent`, …) live in its `styles/styles.css`, which an app does not load: give each `var()` in the block's CSS a fallback, or define the variables in your app's global CSS |
| A block's margins or paddings are gone | your app's global reset (`* { margin: 0 }`) is not in a layer, so it wins over the blocks' `@layer blocks` rules; put the reset in a layer, or scope it |
| Blocks missing after a client navigation to another release | the browser lacks multiple import maps (Chrome 133+); a reload shows them |

## Status and error codes

`onStatus` reports `mounting`, then one of:

| Status | Means |
| --- | --- |
| `ready` | every block mounted |
| `partial` | some blocks failed; `reports` says which |
| `static` | shown without blocks; `onError` says why |
| `error` | without blocks while `requireBlocks` is set |

On a Foliwake page, the site's loader (`scripts/components.js`) logs these codes to the console
and, on local and preview pages, shows a notice before the failed block:

| Code | Means |
| --- | --- |
| `LOADER_DESCRIPTOR_FAILED` | `components/components.json` could not be fetched or is not valid |
| `LOADER_CONTRACT_MISMATCH` | the descriptor's HTML contract differs from the page's |
| `LOADER_UNKNOWN_COMPONENT` | the block's name is not in the descriptor |
| `LOADER_CSS_FAILED` | the block's stylesheet failed to load |
| `LOADER_JS_FAILED` | importing the block's module failed (404, syntax error, …) |
| `LOADER_INIT_INVALID` | the module has no default export function |
| `LOADER_BLOCK_NAME_MISMATCH` | `defineBlock('<name>', …)` names another block than its folder |
| `LOADER_BLOCK_CONTRACT` | the block declares another major of the blocks contract |
| `LOADER_INIT_FAILED` | `init` threw, or returned a rejected promise |
