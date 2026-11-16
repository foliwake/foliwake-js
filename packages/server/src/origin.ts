// The origin client: the only place a credential value is read. The secret (a password, or the private key of
// a service token) is read from the named variable at each request (so a rotated secret takes effect without a
// restart), used for the Authorization header and nowhere else: never logged, never in an error message, never
// returned. A service token is signed for each request and never cached or reused.
import type { ChannelName } from '@foliwake/blocks-contract/page';
import { SignJWT, importJWK, type JWK } from 'jose';
import { endpointOf, type BasicAuth, type FoliwakeAppConfig, type ServiceTokenAuth } from './config.js';
import { LIMITS } from './constants.js';
import { FoliwakeConfigError } from './errors.js';

type SigningKey = Awaited<ReturnType<typeof importJWK>>;

/** Seconds a service token lives: `exp = iat + 60`. Delivery accepts at most 120, with 5 s of clock skew. */
export const SERVICE_TOKEN_LIFETIME_SECONDS = 60;

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
  /** The clock of service tokens, in milliseconds (tests); default Date.now. */
  now?: () => number;
}

function basicAuthorization(auth: BasicAuth, channel: ChannelName, config: FoliwakeAppConfig, env: NodeJS.ProcessEnv): string {
  const password = env[auth.passwordEnv];
  if (password === undefined || password === '') {
    throw new FoliwakeConfigError(`The ${channel} site needs the password in the environment variable ${auth.passwordEnv} (named in ${config.from}); it is not set on this server.`);
  }
  return `Basic ${Buffer.from(`${auth.username}:${password}`, 'utf8').toString('base64')}`;
}

const PRIVATE_KEY_SHAPE = 'an ES256 private key as JWK JSON text ({"kty": "EC", "crv": "P-256", "x", "y", "d"})';

// The private key of a variable's current text. The parsed key is kept for the same text only, so a
// rotated value takes effect at the next request. Messages never contain the value or a parse error of it.
function createPrivateKeyReader() {
  let last: { text: string; kid: string; key: Promise<SigningKey> } | null = null;
  return (auth: ServiceTokenAuth, channel: ChannelName, config: FoliwakeAppConfig, env: NodeJS.ProcessEnv) => {
    const text = env[auth.privateKeyEnv];
    const where = `The ${channel} site's signing key in ${auth.privateKeyEnv} (named in ${config.from})`;
    if (text === undefined || text === '') {
      throw new FoliwakeConfigError(`The ${channel} site needs ${PRIVATE_KEY_SHAPE} in the environment variable ${auth.privateKeyEnv} (named in ${config.from}); it is not set on this server.`);
    }
    if (last && last.text === text && last.kid === auth.kid) return last.key;
    let jwk: unknown;
    try {
      jwk = JSON.parse(text);
    } catch {
      throw new FoliwakeConfigError(`${where} is not valid JSON: it must be ${PRIVATE_KEY_SHAPE}.`);
    }
    const key = jwk as Record<string, unknown>;
    if (key === null || typeof key !== 'object' || Array.isArray(key) || key.kty !== 'EC' || key.crv !== 'P-256' || typeof key.d !== 'string') {
      throw new FoliwakeConfigError(`${where} must be ${PRIVATE_KEY_SHAPE}.`);
    }
    if (key.alg !== undefined && key.alg !== 'ES256') throw new FoliwakeConfigError(`${where}: "alg" must be "ES256" when given.`);
    if (key.kid !== undefined && key.kid !== auth.kid) {
      throw new FoliwakeConfigError(`${where} has kid "${String(key.kid).slice(0, 128)}", but the config names kid "${auth.kid}": the delivery would look up the wrong public key.`);
    }
    const imported = importJWK(key as JWK, 'ES256').catch(() => {
      throw new FoliwakeConfigError(`${where} could not be read as ${PRIVATE_KEY_SHAPE}.`);
    });
    last = { text, kid: auth.kid, key: imported };
    imported.catch(() => {
      if (last?.key === imported) last = null;
    });
    return imported;
  };
}

/**
 * The service token of one request: ES256, header `kid`, claims `iss`, `aud: site:<site>`, `iat`,
 * `exp = iat + 60` and `path`, the exact path of the request as it goes on the wire (no query).
 */
async function serviceTokenAuthorization(auth: ServiceTokenAuth, site: string, path: string, key: SigningKey, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const token = await new SignJWT({ path })
    .setProtectedHeader({ alg: 'ES256', kid: auth.kid, typ: 'JWT' })
    .setIssuer(auth.issuer)
    .setAudience(`site:${site}`)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SERVICE_TOKEN_LIFETIME_SECONDS)
    .sign(key);
  return `Bearer ${token}`;
}

/**
 * The client for the config's origins. The secret is read from the environment at each request (a rotated
 * secret takes effect without a restart) and goes only into the Authorization header: `basic` sends the
 * password of `passwordEnv`; `service-token` signs a fresh token for the request's exact path with the
 * private key of `privateKeyEnv`.
 *
 * @param env - Where secrets are read (default `process.env`).
 */
export function createOriginClient(config: FoliwakeAppConfig, env: NodeJS.ProcessEnv = process.env, opts: OriginClientOptions = {}): OriginClient {
  const doFetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? LIMITS.timeoutMs;
  const now = opts.now ?? Date.now;
  const privateKeyOf = createPrivateKeyReader();

  async function authorization(channel: ChannelName, url: URL): Promise<string | null> {
    const { auth } = endpointOf(config, channel);
    if (!auth) return null;
    if (auth.type === 'basic') return basicAuthorization(auth, channel, config, env);
    const key = await privateKeyOf(auth, channel, config, env);
    return serviceTokenAuthorization(auth, config.site, url.pathname, key, now());
  }

  return Object.freeze({
    config,
    originOf: (channel: ChannelName) => endpointOf(config, channel).origin,
    async request(channel: ChannelName, path: string, ropts: OriginRequestOptions = {}) {
      if (!path.startsWith('/') || path.startsWith('//')) throw new TypeError('origin path must be absolute');
      const { origin } = endpointOf(config, channel);
      // Parsed once: the token names the path exactly as this URL sends it.
      const url = new URL(`${origin}${path}`);
      const headers: Record<string, string> = { ...(ropts.headers ?? {}) };
      const auth = await authorization(channel, url);
      if (auth) headers.Authorization = auth;
      return doFetch(url.href, {
        method: ropts.method ?? 'GET',
        headers,
        redirect: 'manual',
        signal: ropts.signal ?? AbortSignal.timeout(timeoutMs),
      });
    },
  });
}
