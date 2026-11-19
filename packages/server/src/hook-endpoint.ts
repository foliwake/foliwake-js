// The hook endpoint without a framework: verify, parse, expire tags, answer. `@foliwake/next/revalidate` wires it to
// next/cache and next/server; `@foliwake/server/handler` uses it with the app's own callbacks; tests drive it with
// plain Request objects.
import {
  FoliwakeHookError,
  HOOK_BODY_LIMIT,
  isFoliwakePagePath,
  parseFoliwakeHook,
  verifyFoliwakeSignature,
  type FoliwakeDeliveryPayload,
  type FoliwakeHookPayload,
} from './hook.js';

/** At most this many pages are read again right after a delivery (`warm`); never on `all`. */
export const WARM_LIMIT = 20;

/** What the endpoint needs from the framework and from the app. */
export interface HookEndpointDeps {
  /** The configured site. */
  site: string;
  /** What a `ping` answers as `sdk`: the package and its version (`@foliwake/next/0.9.0`). */
  sdk: string;
  /** The accepted secrets, read per request (current, then previous). */
  secrets(): (string | undefined)[];
  /** The live tag of the site (no path) or of one path. */
  liveTag(path?: string): string;
  /** Expires one tag (revalidateTag with the chosen profile). */
  expire(tag: string): void;
  /** Reads one page into the cache again. */
  warm(path: string): Promise<unknown>;
  /** Runs work after the response is sent. */
  schedule(task: () => Promise<void>): void;
  /** Whether pages are read again after a delivery. */
  warmPages: boolean;
  onDelivery?: (payload: FoliwakeDeliveryPayload) => void | Promise<void>;
  toleranceS?: number;
  now?: () => number;
  log: Pick<Console, 'warn' | 'error'>;
}

/** Where `hookSecretsFrom` reads and what it warns on. */
export interface HookSecretSource {
  /** The variables, current first, then the previous one while it is rotated; undefined entries are skipped. */
  names: readonly (string | undefined)[];
  /** Where the variables are read, per call; default process.env. */
  env?: NodeJS.ProcessEnv;
  log: Pick<Console, 'warn'>;
}

/** The value with surrounding whitespace removed; an all-whitespace value is unset. */
function trimmedSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The `secrets()` of the hook endpoint read from environment variables: each value is trimmed of leading and
 * trailing whitespace and newlines (a secret pasted from `openssl rand -hex 32` often ends in one), and an
 * all-whitespace value counts as unset. The first time trimming changes a variable's value, one warning names
 * the variable, never the value.
 */
export function hookSecretsFrom(source: HookSecretSource): () => (string | undefined)[] {
  const warned = new Set<string>();
  const read = (name: string): string | undefined => {
    const raw = (source.env ?? process.env)[name];
    const secret = trimmedSecret(raw);
    if (raw !== undefined && raw !== secret && !warned.has(name)) {
      warned.add(name);
      source.log.warn(`[foliwake] hook: ${name} has surrounding whitespace; it is trimmed. Store it without.`);
    }
    return secret;
  };
  return () => source.names.map((name) => (name ? read(name) : undefined));
}

class TooLarge extends Error {}

function answer(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function refuse(status: number, error: string): Response {
  return answer(status, { ok: false, error });
}

function declaredTooLarge(request: Request): boolean {
  const length = Number(request.headers.get('content-length') ?? '0');
  return Number.isFinite(length) && length > HOOK_BODY_LIMIT;
}

function joined(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** The body, cut at HOOK_BODY_LIMIT whatever Content-Length says. */
async function readBody(request: Request): Promise<Uint8Array> {
  if (declaredTooLarge(request)) throw new TooLarge();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    total += read.value.byteLength;
    if (total > HOOK_BODY_LIMIT) {
      await reader.cancel().catch(() => {});
      throw new TooLarge();
    }
    chunks.push(read.value);
  }
  return joined(chunks, total);
}

/** The tags a delivery expires: the site's live tag on `all`, else one tag per listed path. */
export function deliveryTags(payload: FoliwakeDeliveryPayload, liveTag: (path?: string) => string): string[] {
  if (payload.all) return [liveTag()];
  return (payload.pages ?? []).map((path) => liveTag(path));
}

/** The pages read again after a delivery: none on `all`, page paths only, at most WARM_LIMIT. */
export function warmPaths(payload: FoliwakeDeliveryPayload): string[] {
  if (payload.all) return [];
  return (payload.pages ?? []).filter(isFoliwakePagePath).slice(0, WARM_LIMIT);
}

function scheduleWarm(deps: HookEndpointDeps, payload: FoliwakeDeliveryPayload): void {
  const paths = warmPaths(payload);
  if (!deps.warmPages || paths.length === 0) return;
  deps.schedule(async () => {
    const results = await Promise.allSettled(paths.map((path) => deps.warm(path)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) deps.log.warn(`[foliwake] hook: ${failed} of ${paths.length} pages were not read again`);
  });
}

async function deliver(deps: HookEndpointDeps, payload: FoliwakeDeliveryPayload): Promise<Response> {
  const tags = deliveryTags(payload, deps.liveTag);
  for (const tag of tags) deps.expire(tag);
  try {
    await deps.onDelivery?.(payload);
  } catch (error) {
    deps.log.error('[foliwake] hook: onDelivery failed; the server will send the delivery again', error);
    return refuse(500, 'on_delivery_failed');
  }
  scheduleWarm(deps, payload);
  return answer(200, { ok: true, revalidated: tags });
}

function verified(deps: HookEndpointDeps, body: Uint8Array, request: Request): Response | null {
  const check = verifyFoliwakeSignature(body, request.headers.get('foliwake-signature'), deps.secrets(), {
    now: deps.now?.(),
    toleranceS: deps.toleranceS,
  });
  if (check.ok) return null;
  if (check.reason !== 'no_secret') return refuse(401, `signature_${check.reason}`);
  deps.log.error('[foliwake] hook: no secret is set; every delivery is refused');
  return refuse(500, 'no_secret');
}

function payloadOf(body: Uint8Array): FoliwakeHookPayload | Response {
  try {
    return parseFoliwakeHook(body);
  } catch (error) {
    if (error instanceof FoliwakeHookError) return refuse(400, error.message);
    throw error;
  }
}

function eventMismatch(request: Request, payload: FoliwakeHookPayload): boolean {
  const event = request.headers.get('foliwake-event');
  return event !== null && event !== payload.event;
}

async function handle(deps: HookEndpointDeps, request: Request): Promise<Response> {
  if (request.method !== 'POST') return refuse(405, 'method_not_allowed');
  const body = await readBody(request);
  const refused = verified(deps, body, request);
  if (refused) return refused;
  const payload = payloadOf(body);
  if (payload instanceof Response) return payload;
  if (eventMismatch(request, payload)) return refuse(400, 'Foliwake-Event does not match the body');
  if (payload.site !== deps.site) return refuse(400, `this app serves the site ${deps.site}`);
  if (payload.event === 'ping') return answer(200, { ok: true, site: deps.site, sdk: deps.sdk });
  return deliver(deps, payload);
}

/**
 * The hook endpoint as a function of a Request: 413 over 64 KiB, 401 on a bad or expired signature, 400 on a
 * body that is not a payload or names another site, 200 otherwise.
 */
export function createHookEndpoint(deps: HookEndpointDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handle(deps, request);
    } catch (error) {
      if (error instanceof TooLarge) return refuse(413, 'body_too_large');
      throw error;
    }
  };
}
