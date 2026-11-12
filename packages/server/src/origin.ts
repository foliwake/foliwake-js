// The origin client: the only place a credential value is read. The password is read from the named
// variable at each request (so a rotated secret takes effect without a restart), put into the
// Authorization header and nowhere else: never logged, never in an error message, never returned.
import type { ChannelName } from '@foliwake/blocks-contract/page';
import { endpointOf, type FoliwakeAppConfig } from './config.js';
import { LIMITS } from './constants.js';
import { FoliwakeConfigError } from './errors.js';

/** Options of one origin request. */
export interface OriginRequestOptions {
  method?: 'GET' | 'HEAD';
  signal?: AbortSignal;
  /** Only these headers are sent (never a browser's). */
  headers?: Record<string, string>;
}

/** Requests to the configured live and preview origins, with the credential added per request. */
export interface OriginClient {
  readonly config: FoliwakeAppConfig;
  /** The origin of a channel (for messages and loopback checks). */
  originOf(channel: ChannelName): string;
  /** GET/HEAD `<origin><path>`; `redirect: 'manual'`, 10 s timeout unless `signal` is given. */
  request(channel: ChannelName, path: string, opts?: OriginRequestOptions): Promise<Response>;
}

/** Options of `createOriginClient`. */
export interface OriginClientOptions {
  /** A fetch implementation (tests); default globalThis.fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function authorization(config: FoliwakeAppConfig, channel: ChannelName, env: NodeJS.ProcessEnv): string | null {
  const { auth } = endpointOf(config, channel);
  if (!auth) return null;
  const password = env[auth.passwordEnv];
  if (password === undefined || password === '') {
    throw new FoliwakeConfigError(`The ${channel} site needs the password in the environment variable ${auth.passwordEnv} (named in ${config.from}); it is not set on this server.`);
  }
  return `Basic ${Buffer.from(`${auth.username}:${password}`, 'utf8').toString('base64')}`;
}

/**
 * The client for the config's origins. The password is read from `env[passwordEnv]` at each request (a rotated
 * secret takes effect without a restart) and goes only into the Authorization header.
 *
 * @param env - Where passwords are read (default `process.env`).
 */
export function createOriginClient(config: FoliwakeAppConfig, env: NodeJS.ProcessEnv = process.env, opts: OriginClientOptions = {}): OriginClient {
  const doFetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? LIMITS.timeoutMs;
  return Object.freeze({
    config,
    originOf: (channel: ChannelName) => endpointOf(config, channel).origin,
    async request(channel: ChannelName, path: string, ropts: OriginRequestOptions = {}) {
      if (!path.startsWith('/') || path.startsWith('//')) throw new TypeError('origin path must be absolute');
      const { origin } = endpointOf(config, channel);
      const headers: Record<string, string> = { ...(ropts.headers ?? {}) };
      const auth = authorization(config, channel, env);
      if (auth) headers.Authorization = auth;
      return doFetch(`${origin}${path}`, {
        method: ropts.method ?? 'GET',
        headers,
        redirect: 'manual',
        signal: ropts.signal ?? AbortSignal.timeout(timeoutMs),
      });
    },
  });
}
