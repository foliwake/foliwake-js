// @foliwake/next/routes: route handlers for app/<proxies.code>/[...path]/route.ts and the media proxy.
import 'server-only';
import { codeHandler, mediaHandler, type AuthorizePreview } from '@foliwake/server/handlers';
import { foliwakeConfig, originClient } from './server.js';

type Context = { params: Promise<{ path: string[] }> };
type RouteHandler = (request: Request, context: Context) => Promise<Response>;

function route(make: typeof codeHandler, opts: { authorizePreview: AuthorizePreview }): { GET: RouteHandler; HEAD: RouteHandler } {
  if (!opts || (opts.authorizePreview !== false && typeof opts.authorizePreview !== 'function')) {
    throw new TypeError('Pass { authorizePreview: <your author check> } or { authorizePreview: false }; no default serves preview.');
  }
  let handler: ReturnType<typeof codeHandler> | null = null;
  const run: RouteHandler = async (request, context) => {
    handler ??= make(foliwakeConfig(), originClient(), opts);
    return handler(request, { path: (await context.params).path ?? [] });
  };
  return { GET: run, HEAD: run };
}

/** `export const { GET, HEAD } = codeRoute({ authorizePreview: isAuthor })` */
export function codeRoute(opts: { authorizePreview: AuthorizePreview }) {
  return route(codeHandler, opts);
}

/** `export const { GET, HEAD } = mediaRoute({ authorizePreview: isAuthor })` */
export function mediaRoute(opts: { authorizePreview: AuthorizePreview }) {
  return route(mediaHandler, opts);
}
