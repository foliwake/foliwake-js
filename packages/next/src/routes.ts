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

/**
 * Route handlers for `app/<proxies.code>/[...path]/route.ts`: serve the files of a code release from the app's
 * origin (`codeHandler` of `@foliwake/server/handlers`). Usage:
 * `export const { GET, HEAD } = codeRoute({ authorizePreview: isAuthor })`. Each handler takes
 * `(request, { params })` and returns a `Response`.
 *
 * @param opts - `authorizePreview`: the app's author check for preview files, or `false`; required.
 */
export function codeRoute(opts: { authorizePreview: AuthorizePreview }) {
  return route(codeHandler, opts);
}

/**
 * Route handlers for `app/<proxies.media>/[...path]/route.ts`: serve hashed pictures (`mediaHandler` of
 * `@foliwake/server/handlers`). Usage: `export const { GET, HEAD } = mediaRoute({ authorizePreview: isAuthor })`.
 *
 * @param opts - `authorizePreview`: the app's author check for preview pictures, or `false`; required.
 */
export function mediaRoute(opts: { authorizePreview: AuthorizePreview }) {
  return route(mediaHandler, opts);
}
