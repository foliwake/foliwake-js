// @foliwake/next (server-only): reading and preparing Foliwake pages in the App Router.
import 'server-only';
export { foliwakeConfig, originClient, foliwakeTags } from './server.js';
export { readEnvelopeCached } from './cache.js';
export { FoliwakeServerPage, readPage, emitPreloadHints, type FoliwakeServerPageProps, type ReadPageOptions } from './page.js';
export { readEnvelope, preparePage, FoliwakePageError, type PrepareOptions, type PageErrorKind } from '@foliwake/server/page';
export type { FoliwakeAppConfig } from '@foliwake/server/config';
export { preloadHints } from '@foliwake/server/preload';
export type { FoliwakePageData, PageEnvelope, ChannelName, PreloadHint } from '@foliwake/blocks-contract/page';
