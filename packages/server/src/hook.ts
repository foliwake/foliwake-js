// @foliwake/server/hook: the signed POST a Foliwake server sends an app once a change is live and the caches in
// front of the origin are refreshed (`delivery.settled`), or to check the app's endpoint (`ping`).
// Wire format, version 1:
//   Foliwake-Event: delivery.settled | ping
//   Foliwake-Delivery: <uuid v4>, new on every attempt
//   Foliwake-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${raw body}`)>
// No framework here: the Next.js route handler is `foliwakeRevalidateHandler` of `@foliwake/next/revalidate`.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PAGE_PATH_PATTERN } from './constants.js';

/** The largest hook body an app accepts, in bytes. */
export const HOOK_BODY_LIMIT = 64 * 1024;

/** How far the signature time may be from the app's clock by default, in seconds. */
export const HOOK_TOLERANCE_SECONDS = 300;

/** The most `pages` a delivery lists; a larger change is sent as `all: true`. */
export const HOOK_PAGES_LIMIT = 100;

/** The operations a delivery reports; a newer server may send others, which an app treats like any change. */
export type FoliwakeOperationKind =
  | 'content_publish'
  | 'unpublish'
  | 'rollback_full'
  | 'code_release'
  | 'rollback_code'
  | 'site_migration'
  | 'recovery_purge'
  | 'engine_update'
  | 'init';

/** `delivery.settled`: the live site is at `generation`, and the caches in front of the origin serve it. */
export interface FoliwakeDeliveryPayload {
  version: 1;
  event: 'delivery.settled';
  site: string;
  /** The live generation; it only grows, except that `init` starts a new history. */
  generation: number;
  /** The site release (`sr_…`), or null. */
  release: string | null;
  /** The code release (`cd_…`), or null. */
  codeRelease: string | null;
  operation: { id: string; kind: FoliwakeOperationKind | (string & {}) };
  /** The changed paths (pages, indexes); present only when `all` is false. A hint, at most 100. */
  pages?: string[];
  /** Every live page may have changed. */
  all: boolean;
  /** Whether the server read the new generation back through its own cache before sending. */
  verified: boolean;
  sentAt: string;
}

/** `ping`: the server checks the endpoint and its secret; the app changes nothing. */
export interface FoliwakePingPayload {
  version: 1;
  event: 'ping';
  site: string;
  sentAt: string;
}

/** Any hook body. */
export type FoliwakeHookPayload = FoliwakeDeliveryPayload | FoliwakePingPayload;

/** Options of `verifyFoliwakeSignature`. */
export interface VerifySignatureOptions {
  /** The app's clock, in milliseconds since the epoch (default `Date.now()`). */
  now?: number;
  /** The allowed distance between the signature time and `now`, in seconds (default 300). */
  toleranceS?: number;
}

/** Why a signature was refused. */
export type SignatureFailure = 'malformed' | 'expired' | 'mismatch' | 'no_secret';

/** The result of `verifyFoliwakeSignature`. */
export type SignatureCheck = { ok: true } | { ok: false; reason: SignatureFailure };

/** A hook body that is not a valid payload. */
export class FoliwakeHookError extends Error {
  override name = 'FoliwakeHookError';
}

const SIGNATURE_TIME = /^\d{1,12}$/;
const SIGNATURE_HEX = /^[0-9a-f]{64}$/;
const TOKEN = /^[a-z][a-z0-9_.]{0,63}$/;

type Body = string | Uint8Array;

function bytesOf(body: Body): Uint8Array {
  return typeof body === 'string' ? new TextEncoder().encode(body) : body;
}

function hmacHex(secret: string, t: string, body: Uint8Array): string {
  return createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex');
}

/**
 * The `Foliwake-Signature` value for a body: what a Foliwake server sends; useful in an app's tests.
 *
 * @param body - The raw body, byte for byte as sent.
 * @param secret - The shared secret.
 * @param t - The signature time in unix seconds (default: now).
 */
export function signFoliwakeHook(body: Body, secret: string, t: number = Math.floor(Date.now() / 1000)): string {
  const time = String(Math.trunc(t));
  return `t=${time},v1=${hmacHex(secret, time, bytesOf(body))}`;
}

type ParsedHeader = { t: string; signatures: string[] };

function parseSignatureHeader(header: string | null): ParsedHeader | null {
  if (header === null) return null;
  let t: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't' && value !== undefined && SIGNATURE_TIME.test(value)) t = value;
    else if (key === 'v1' && value !== undefined && SIGNATURE_HEX.test(value)) signatures.push(value);
  }
  return t === null || signatures.length === 0 ? null : { t, signatures };
}

function sameHex(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function matchesAny(parsed: ParsedHeader, secrets: string[], body: Uint8Array): boolean {
  let matched = false;
  for (const secret of secrets) {
    const expected = hmacHex(secret, parsed.t, body);
    for (const signature of parsed.signatures) matched = sameHex(expected, signature) || matched;
  }
  return matched;
}

/**
 * Checks `Foliwake-Signature` against the raw body. Every secret is tried (the current one and, while it is
 * rotated, the previous one); the comparison is constant-time.
 *
 * @param body - The raw request body, byte for byte as received.
 * @param header - The `Foliwake-Signature` header, or null.
 * @param secrets - The accepted secrets; empty or blank ones are ignored.
 * @param options - `now` (ms) and `toleranceS` (default 300).
 * @returns `{ ok: true }`, or `{ ok: false, reason }`: `malformed`, `expired`, `mismatch` or `no_secret`.
 */
export function verifyFoliwakeSignature(
  body: Body,
  header: string | null,
  secrets: readonly (string | null | undefined)[],
  options: VerifySignatureOptions = {},
): SignatureCheck {
  const usable = secrets.filter((s): s is string => typeof s === 'string' && s.length > 0);
  if (usable.length === 0) return { ok: false, reason: 'no_secret' };
  const parsed = parseSignatureHeader(header);
  if (parsed === null) return { ok: false, reason: 'malformed' };
  const nowS = (options.now ?? Date.now()) / 1000;
  const tolerance = options.toleranceS ?? HOOK_TOLERANCE_SECONDS;
  if (Math.abs(nowS - Number(parsed.t)) > tolerance) return { ok: false, reason: 'expired' };
  if (!matchesAny(parsed, usable, bytesOf(body))) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

type Fields = Record<string, unknown>;

function fail(message: string): never {
  throw new FoliwakeHookError(message);
}

function objectOf(value: unknown, what: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${what} is not an object`);
  return value as Fields;
}

function stringOf(fields: Fields, key: string): string {
  const value = fields[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) fail(`${key} is not a string`);
  return value;
}

function nullableStringOf(fields: Fields, key: string): string | null {
  return fields[key] === null || fields[key] === undefined ? null : stringOf(fields, key);
}

function booleanOf(fields: Fields, key: string): boolean {
  if (typeof fields[key] !== 'boolean') fail(`${key} is not a boolean`);
  return fields[key] as boolean;
}

function generationOf(fields: Fields): number {
  const value = fields.generation;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('generation is not an integer');
  return value;
}

function operationOf(fields: Fields): FoliwakeDeliveryPayload['operation'] {
  const operation = objectOf(fields.operation, 'operation');
  const kind = stringOf(operation, 'kind');
  if (!TOKEN.test(kind)) fail('operation.kind is not a token');
  return { id: stringOf(operation, 'id'), kind };
}

/** Whether a path of `pages` is a page (`/lessons/a`), not another file such as `/lessons/query-index.json`. */
export function isFoliwakePagePath(path: string): boolean {
  return PAGE_PATH_PATTERN.test(path);
}

function isHookPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && value.length <= 1024;
}

function pagesOf(fields: Fields): string[] {
  const pages = fields.pages;
  if (!Array.isArray(pages)) fail('pages is missing while all is false');
  if (pages.length > HOOK_PAGES_LIMIT) fail(`pages lists more than ${HOOK_PAGES_LIMIT} paths`);
  if (!pages.every(isHookPath)) fail('pages holds a value that is not a path');
  return [...new Set(pages)];
}

function deliveryOf(fields: Fields, site: string, sentAt: string): FoliwakeDeliveryPayload {
  const all = booleanOf(fields, 'all');
  const payload: FoliwakeDeliveryPayload = {
    version: 1,
    event: 'delivery.settled',
    site,
    generation: generationOf(fields),
    release: nullableStringOf(fields, 'release'),
    codeRelease: nullableStringOf(fields, 'codeRelease'),
    operation: operationOf(fields),
    all,
    verified: booleanOf(fields, 'verified'),
    sentAt,
  };
  if (!all) payload.pages = pagesOf(fields);
  return payload;
}

function jsonOf(body: Body): unknown {
  try {
    const text = typeof body === 'string' ? body : new TextDecoder('utf-8', { fatal: true }).decode(body);
    return JSON.parse(text);
  } catch {
    return fail('the body is not JSON');
  }
}

/**
 * Parses a hook body (after its signature was checked). Unknown fields are ignored; an unknown operation kind is
 * accepted, so a newer server's operations still refresh the app.
 *
 * @param body - The raw body.
 * @returns The payload; throws FoliwakeHookError when it is not a version 1 `delivery.settled` or `ping`.
 */
export function parseFoliwakeHook(body: Body): FoliwakeHookPayload {
  const fields = objectOf(jsonOf(body), 'the body');
  if (fields.version !== 1) fail('version is not 1');
  const site = stringOf(fields, 'site');
  const sentAt = stringOf(fields, 'sentAt');
  if (fields.event === 'ping') return { version: 1, event: 'ping', site, sentAt };
  if (fields.event === 'delivery.settled') return deliveryOf(fields, site, sentAt);
  return fail('event is neither delivery.settled nor ping');
}
