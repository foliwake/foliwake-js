// The CLI's side of the device flow (RFC 8628) and of logout, against a server's `/api/auth/*`.
import os from 'node:os';

import { COMMAND } from '../settings.js';
import { clientName } from '../version.js';

export interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresInS: number;
  intervalS: number;
}

export class SignInError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** A sign-in stopped on this computer (Ctrl+C) before it was approved. */
export class SignInCancelled extends SignInError {
  constructor() {
    super('SIGN_IN_CANCELLED', 'The sign-in was cancelled.');
  }
}

/** One request is bounded: a server that hangs is a transient failure, not a stuck CLI. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Backoff on transient failures while polling (RFC 8628 §3.5): doubled, at most this. */
const MAX_BACKOFF_S = 60;

type Answer = { status: number; json: Record<string, unknown> };

async function send(origin: string, route: string, body: unknown, headers: Record<string, string>) {
  try {
    return await fetch(`${origin}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SignInError('SERVER_UNREACHABLE', `The server ${origin} cannot be reached.`);
  }
}

type HeaderMap = Record<string, string>;

async function post(origin: string, route: string, body: unknown, headers: HeaderMap = {}): Promise<Answer> {
  const response = await send(origin, route, body, headers);
  const text = await response.text();
  try {
    return { status: response.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  } catch {
    const message = `The server ${origin} did not answer as a Foliwake server (HTTP ${response.status}).`;
    throw new SignInError('SERVER_FAILED', message);
  }
}

const asString = (value: unknown, name: string, origin: string): string => {
  if (typeof value === 'string' && value) return value;
  throw new SignInError('SERVER_FAILED', `The server ${origin} sent no ${name}.`);
};

const positive = (value: unknown, fallback: number): number => (Number(value) > 0 ? Number(value) : fallback);

/** The approval page; it must be on the server signed in to (a link elsewhere could collect the code). */
function approvalPages(json: Record<string, unknown>, origin: string): { uri: string; complete: string } {
  const uri = asString(json.verification_uri, 'verification address', origin);
  if (new URL(uri).origin !== origin) {
    throw new SignInError('SERVER_FAILED', `The server ${origin} named an approval page on another site.`);
  }
  const complete = json.verification_uri_complete;
  const sameSite = typeof complete === 'string' && new URL(complete).origin === origin;
  return { uri, complete: sameSite ? complete : uri };
}

export async function startDeviceSignIn(origin: string): Promise<DeviceStart> {
  const { status, json } = await post(origin, '/api/auth/device/code', { client: clientName(), host: os.hostname() });
  if (status !== 200) {
    const error = (json.error ?? {}) as { code?: string; message?: string };
    const reason = error.message ?? `HTTP ${status}`;
    throw new SignInError(error.code ?? 'SIGN_IN_REFUSED', `The server refused to start a sign-in: ${reason}`);
  }
  const pages = approvalPages(json, origin);
  return {
    deviceCode: asString(json.device_code, 'device code', origin),
    userCode: asString(json.user_code, 'user code', origin),
    verificationUri: pages.uri,
    verificationUriComplete: pages.complete,
    expiresInS: positive(json.expires_in, 600),
    intervalS: positive(json.interval, 5),
  };
}

/** A failure worth waiting out: the network, a timeout, a gateway or an overloaded server. */
const transient = (status: number) => status === 429 || status >= 500;

/** A sleep that ends early with SignInCancelled when `signal` aborts. */
export function abortableSleep(signal: AbortSignal): (ms: number) => Promise<void> {
  return (ms) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new SignInCancelled());
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new SignInCancelled());
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
}

async function poll(origin: string, start: DeviceStart): Promise<Answer> {
  try {
    return await post(origin, '/api/auth/device/token', { device_code: start.deviceCode });
  } catch (error) {
    if (!(error instanceof SignInError && error.code === 'SERVER_UNREACHABLE')) throw error;
    return { status: 503, json: {} };
  }
}

const EXPIRED = `The code expired before it was approved; run \`${COMMAND} login\` again.`;

function refusedSignIn({ status, json }: Answer): SignInError {
  const denied = 'The sign-in was denied in the browser.';
  if (json.error === 'access_denied') return new SignInError('SIGN_IN_DENIED', denied);
  if (json.error === 'expired_token') return new SignInError('SIGN_IN_EXPIRED', EXPIRED);
  const detail = typeof json.error === 'string' ? `, ${json.error}` : '';
  return new SignInError('SIGN_IN_FAILED', `The server refused the sign-in (HTTP ${status}${detail}).`);
}

function signedIn(json: Record<string, unknown>, origin: string): { token: string; email: string | null } {
  const email = json.account_email;
  const token = asString(json.access_token, 'token', origin);
  return { token, email: typeof email === 'string' && email.length <= 320 ? email : null };
}

export interface WaitOptions {
  sleep?: (ms: number) => Promise<unknown>;
  now?: () => number;
}

const realSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls until the sign-in is approved (the token, with the account's e-mail address when the server says
 * it), denied or expired (a SignInError). A transient failure doubles the wait, up to a minute.
 */
export async function waitForSignIn(
  origin: string,
  start: DeviceStart,
  { sleep = realSleep, now = Date.now }: WaitOptions = {},
): Promise<{ token: string; email: string | null }> {
  let intervalS = start.intervalS;
  let backoffS = 0;
  const deadline = now() + start.expiresInS * 1000;
  while (now() < deadline) {
    await sleep((backoffS || intervalS) * 1000);
    const answer = await poll(origin, start);
    if (transient(answer.status) && answer.json.error === undefined) {
      backoffS = Math.min(MAX_BACKOFF_S, Math.max(intervalS, backoffS) * 2);
      continue;
    }
    backoffS = 0;
    if (answer.status === 200) return signedIn(answer.json, origin);
    if (answer.json.error === 'authorization_pending') continue;
    if (answer.json.error === 'slow_down') {
      intervalS += 5;
      continue;
    }
    throw refusedSignIn(answer);
  }
  throw new SignInError('SIGN_IN_EXPIRED', EXPIRED);
}

/** Revokes the token on its server. False when the server could not be asked. */
export async function revokeToken(origin: string, token: string): Promise<boolean> {
  try {
    const { status } = await post(origin, '/api/auth/logout', {}, { authorization: `Bearer ${token}` });
    return status === 204;
  } catch {
    return false;
  }
}
