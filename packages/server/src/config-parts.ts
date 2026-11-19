// The parsers of the parts of a config file (auth, proxies, blocks, media, pages, app), shared by version 2
// (./config) and version 3 (./config-v3). Internal: not a package export.
import { FoliwakeConfigError } from './errors.js';
import { checkEnvName, checkUsername, parseRemoteUrl } from './config-checks.js';
import { globProblem, GLOB_LIMITS } from './glob.js';
import type {
  BasicAuth,
  FoliwakeAppSettings,
  FoliwakeEndpoint,
  ParseOptions,
  RemoteAuth,
  ServiceTokenAuth,
} from './config.js';

export const SECRET_KEYS =
  /^(password|passwd|pass|secret|token|apikey|api_key|authorization|credentials?|private_?key|signing_?key|jwk|d)$/i;
export const ISSUER = /^[A-Za-z0-9._:/-]{1,256}$/;
export const KID = /^[A-Za-z0-9._-]{1,128}$/;
export const SITE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const PREFIX = /^(?:\/[a-z0-9-]+)+$/;
export const RESERVED_PREFIXES = ['/', '/_next', '/api', '/code', '/media'];
export const ENTRY_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
export const ENTRY_ROOTS = ['scripts', 'components', '_foliwake'];
export const CONTRACT = /^foliwake-blocks\/([1-9][0-9]{0,2})$/;
export const EVENT_PREFIX = /^[a-z][a-z0-9-]{0,31}$/;
export const DEFAULTS = { code: '/foliwake-code', media: '/foliwake-media', contract: 'foliwake-blocks/2', eventPrefix: 'block', revalidate: 300 };

export type Obj = Record<string, unknown>;
export const isObject = (value: unknown): value is Obj => value !== null && typeof value === 'object' && !Array.isArray(value);

export function refuseSecrets(value: unknown, at: string, file: string): void {
  if (Array.isArray(value)) value.forEach((item, i) => refuseSecrets(item, `${at}[${i}]`, file));
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.test(key)) {
      throw new FoliwakeConfigError(
        `${file}: "${at}${key}" looks like a stored secret. This file is committed: ` +
          'keep only the NAME of an environment variable ("passwordEnv", "privateKeyEnv") ' +
          'and remove the secret (rotate it if it was committed).',
      );
    }
    refuseSecrets(child, `${at}${key}.`, file);
  }
}

export function onlyKeys(value: Obj, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new FoliwakeConfigError(`${where}: unknown key "${key}" (allowed: ${allowed.join(', ')}).`);
  }
}

export function parseEndpoint(value: unknown, where: string, opts: ParseOptions): FoliwakeEndpoint {
  if (!isObject(value)) throw new FoliwakeConfigError(`${where}: must be an object {"url": …, "auth": …}.`);
  onlyKeys(value, ['url', 'auth'], where);
  const origin = parseRemoteUrl(value.url, `${where}.url`);
  if (value.auth === undefined || value.auth === null) return { origin, auth: null };
  return { origin, auth: parseAuth(value.auth, `${where}.auth`, opts) };
}

export const AUTH_SHAPES =
  '{"type": "basic", "username": …, "passwordEnv": …} or ' +
  '{"type": "service-token", "issuer": …, "kid": …, "privateKeyEnv": …}';

export function parseBasicAuth(auth: Obj, where: string, opts: ParseOptions): BasicAuth {
  onlyKeys(auth, ['type', 'username', 'passwordEnv'], where);
  return {
    type: 'basic',
    username: checkUsername(auth.username, `${where}.username`),
    passwordEnv: checkEnvName(auth.passwordEnv, `${where}.passwordEnv`, opts.envNameProblem),
  };
}

export function parseServiceTokenAuth(auth: Obj, where: string, opts: ParseOptions): ServiceTokenAuth {
  onlyKeys(auth, ['type', 'issuer', 'kid', 'privateKeyEnv'], where);
  if (typeof auth.issuer !== 'string' || !ISSUER.test(auth.issuer)) {
    throw new FoliwakeConfigError(
      `${where}.issuer: the issuer the delivery expects (its TOKEN_ISSUER), [A-Za-z0-9._:/-], such as "my-app".`,
    );
  }
  if (typeof auth.kid !== 'string' || !KID.test(auth.kid)) {
    throw new FoliwakeConfigError(
      `${where}.kid: the key id of the public key the delivery holds, [A-Za-z0-9._-], such as "my-app-2026-11".`,
    );
  }
  return {
    type: 'service-token',
    issuer: auth.issuer,
    kid: auth.kid,
    privateKeyEnv: checkEnvName(auth.privateKeyEnv, `${where}.privateKeyEnv`, opts.envNameProblem),
  };
}

export function parseAuth(auth: unknown, where: string, opts: ParseOptions): RemoteAuth {
  if (!isObject(auth)) throw new FoliwakeConfigError(`${where}: must be ${AUTH_SHAPES}.`);
  if (auth.type === 'basic') return parseBasicAuth(auth, where, opts);
  if (auth.type === 'service-token') return parseServiceTokenAuth(auth, where, opts);
  throw new FoliwakeConfigError(`${where}.type: "basic" or "service-token"; the auth must be ${AUTH_SHAPES}.`);
}

export function parsePrefix(value: unknown, fallback: string, where: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !PREFIX.test(value)) throw new FoliwakeConfigError(`${where}: an absolute app path of [a-z0-9-] segments, such as "${fallback}".`);
  return value;
}

/** The proxy prefixes of a config without `proxies`: version 2, and version 3 (`/foliwake/…`, one handler). */
export const PROXY_DEFAULTS = {
  2: { code: DEFAULTS.code, media: DEFAULTS.media },
  3: { code: '/foliwake/code', media: '/foliwake/media' },
} as const;

export function parseProxies(
  value: unknown,
  where: string,
  defaults: { code: string; media: string } = PROXY_DEFAULTS[2],
): FoliwakeAppSettings['proxies'] {
  if (value === undefined) return { code: defaults.code, media: defaults.media, pages: null };
  if (!isObject(value)) throw new FoliwakeConfigError(`${where}: must be an object {"code": …, "media": …, "pages": null}.`);
  onlyKeys(value, ['code', 'media', 'pages'], where);
  if (value.pages !== undefined && value.pages !== null) throw new FoliwakeConfigError(`${where}.pages: must be null in this version (the pages proxy comes with client-side reads).`);
  const proxies = {
    code: parsePrefix(value.code, defaults.code, `${where}.code`),
    media: parsePrefix(value.media, defaults.media, `${where}.media`),
    pages: null,
  };
  const list = [proxies.code, proxies.media];
  for (const prefix of list) {
    const reserved = RESERVED_PREFIXES.find((r) => prefix === r || (r !== '/' && prefix.startsWith(`${r}/`)));
    if (reserved) throw new FoliwakeConfigError(`${where}: "${prefix}" collides with the reserved app path ${reserved}.`);
  }
  if (proxies.code === proxies.media || proxies.code.startsWith(`${proxies.media}/`) || proxies.media.startsWith(`${proxies.code}/`)) {
    throw new FoliwakeConfigError(`${where}: "code" and "media" must be different prefixes, neither inside the other.`);
  }
  return proxies;
}

export function parseEntry(value: unknown, where: string): string | null {
  if (value === undefined || value === null) return null;
  const problem = 'a path inside a code release, such as "scripts/blocks.js": 1–8 segments of [A-Za-z0-9_.-], the first one scripts, components or _foliwake, ending in .js';
  if (typeof value !== 'string') throw new FoliwakeConfigError(`${where}: ${problem}.`);
  const segments = value.split('/');
  if (segments.length < 2 || segments.length > 8 || !ENTRY_ROOTS.includes(segments[0]!) || !value.endsWith('.js')
    || segments.some((s) => !ENTRY_SEGMENT.test(s) || s === '.' || s === '..' || s.includes('..'))) {
    throw new FoliwakeConfigError(`${where}: ${problem}.`);
  }
  return value;
}

export function parseBlocks(value: unknown, where: string): FoliwakeAppSettings['blocks'] {
  const blocks = value === undefined ? {} : value;
  if (!isObject(blocks)) throw new FoliwakeConfigError(`${where}: must be an object {"entry": …, "contract": …, "eventPrefix": …}.`);
  onlyKeys(blocks, ['entry', 'contract', 'eventPrefix'], where);
  const contract = blocks.contract === undefined ? DEFAULTS.contract : blocks.contract;
  const match = typeof contract === 'string' ? CONTRACT.exec(contract) : null;
  if (!match) throw new FoliwakeConfigError(`${where}.contract: "foliwake-blocks/<major>", such as "foliwake-blocks/2".`);
  const eventPrefix = blocks.eventPrefix === undefined ? DEFAULTS.eventPrefix : blocks.eventPrefix;
  if (typeof eventPrefix !== 'string' || !EVENT_PREFIX.test(eventPrefix)) throw new FoliwakeConfigError(`${where}.eventPrefix: [a-z][a-z0-9-], at most 32 characters.`);
  const entry = parseEntry(blocks.entry, `${where}.entry`);
  return { entry, contract: contract as string, major: Number(match[1]), eventPrefix, fromRelease: false };
}

export function parseMedia(value: unknown, where: string): FoliwakeAppSettings['media'] {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) throw new FoliwakeConfigError(`${where}: must be an object {"base": "https://…", "transform": "cloudflare-images"}.`);
  onlyKeys(value, ['base', 'transform'], where);
  const base = parseRemoteUrl(value.base, `${where}.base`);
  if (!base.startsWith('https:')) throw new FoliwakeConfigError(`${where}.base: must be https.`);
  if (value.transform !== undefined && value.transform !== null && value.transform !== 'cloudflare-images') {
    throw new FoliwakeConfigError(`${where}.transform: only "cloudflare-images" (or null) is supported.`);
  }
  return { base, transform: value.transform === 'cloudflare-images' ? 'cloudflare-images' : null };
}

export function parsePages(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > GLOB_LIMITS.globsPerList) {
    throw new FoliwakeConfigError(`${where}: a list of 1–${GLOB_LIMITS.globsPerList} page globs, such as ["/lessons/**"].`);
  }
  return value.map((glob, i) => {
    const problem = typeof glob === 'string' ? globProblem(glob) : 'must be a string';
    if (problem) throw new FoliwakeConfigError(`${where}[${i}]: ${problem}.`);
    return glob as string;
  });
}

/** `app.revalidate`: whole seconds, 1–86400; default 300. */
export function parseRevalidate(value: unknown, where: string): number {
  const revalidate = value === undefined ? DEFAULTS.revalidate : value;
  if (typeof revalidate !== 'number' || !Number.isInteger(revalidate) || revalidate < 1 || revalidate > 86_400) {
    throw new FoliwakeConfigError(`${where}: whole seconds between 1 and 86400.`);
  }
  return revalidate;
}

export function parseApp(value: unknown, where: string): FoliwakeAppSettings {
  if (!isObject(value)) throw new FoliwakeConfigError(`${where}: must be an object {"pages": […], …}.`);
  onlyKeys(value, ['pages', 'proxies', 'blocks', 'media', 'revalidate'], where);
  const revalidate = parseRevalidate(value.revalidate, `${where}.revalidate`);
  return {
    pages: Object.freeze(parsePages(value.pages, `${where}.pages`)),
    proxies: parseProxies(value.proxies, `${where}.proxies`),
    blocks: parseBlocks(value.blocks, `${where}.blocks`),
    media: parseMedia(value.media, `${where}.media`),
    revalidate,
  };
}
