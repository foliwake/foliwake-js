// @foliwake/next/handler: every Foliwake route of a Next app in one route file,
// `app/foliwake/[...path]/route.ts`:
//
//   export { GET, HEAD, POST } from '@foliwake/next/handler';
//
// A thin wrapper of `createFoliwakeHandler` of `@foliwake/server/handler`: the config is the one withFoliwake()
// inlined at build time, and the hook expires Next's cache tags (`foliwakeRevalidateHandler`).
import 'server-only';
import { createFoliwakeHandler as createServerHandler, HOOK_SECRET_ENV } from '@foliwake/server/handler';
import type { AuthorizePreview } from '@foliwake/server/handlers';
import { foliwakeRevalidateHandler, type FoliwakeRevalidateOptions } from './revalidate.js';
import { foliwakeConfig } from './server.js';

/** The hook options of the Next handler: those of `foliwakeRevalidateHandler`, the secret variable optional. */
export type FoliwakeNextHookOptions = Omit<FoliwakeRevalidateOptions, 'secretEnv'> & { secretEnv?: string };

/** Options of `createFoliwakeHandler`. */
export interface FoliwakeNextHandlerOptions {
  /** The app's author check for preview files; default `false` (preview answers 404). */
  authorizePreview?: AuthorizePreview;
  /** The hook (default secret variable FOLIWAKE_HOOK_SECRET); `false` answers 404 on `/foliwake/hook`. */
  hook?: false | FoliwakeNextHookOptions;
  /** The app path of the hook and health routes; default `/foliwake` (the route file's folder). */
  base?: string;
}

type RouteHandler = (request: Request, context?: unknown) => Promise<Response>;

/** The route module exports: `export const { GET, HEAD, POST } = createFoliwakeHandler(…)`. */
export interface FoliwakeRoutes {
  GET: RouteHandler;
  HEAD: RouteHandler;
  POST: RouteHandler;
}

function nextHook(hook: FoliwakeNextHookOptions): (request: Request) => Promise<Response> {
  return foliwakeRevalidateHandler({ ...hook, secretEnv: hook.secretEnv ?? HOOK_SECRET_ENV }).POST;
}

/**
 * The Foliwake routes of a Next app (code and media proxies, hook, health) for
 * `app/foliwake/[...path]/route.ts`. Preview is off unless `authorizePreview` is given.
 *
 * @param opts - `authorizePreview` (default false), `hook` (default on, secret in FOLIWAKE_HOOK_SECRET), `base`.
 */
export function createFoliwakeHandler(opts: FoliwakeNextHandlerOptions = {}): FoliwakeRoutes {
  const handler = createServerHandler({
    config: foliwakeConfig,
    authorizePreview: opts.authorizePreview ?? false,
    hook: opts.hook === false ? false : { endpoint: nextHook(opts.hook ?? {}) },
    ...(opts.base ? { base: opts.base } : {}),
  });
  const route: RouteHandler = (request) => handler(request);
  return { GET: route, HEAD: route, POST: route };
}

/** The default routes: preview off, hook on (FOLIWAKE_HOOK_SECRET). */
export const { GET, HEAD, POST } = createFoliwakeHandler();
