// `foliwake.remote.json` version 2 (docs/plan/react-packages.md §3, schema schemas/remote-2.schema.json):
// which Foliwake site an app reads, with which credential NAMES, and the app's settings. One parser for the
// engine CLI (`foliwake dev --remote`) and the app packages. Version 1 is no longer read (owner P4).
//
// No secrets: anything that looks like a stored secret refuses the file; credentials are variable names,
// read on the server per origin request (./origin), never logged, never sent to a browser.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChannelName, ClientSettings } from '@foliwake/blocks-contract/page';
import { FoliwakeConfigError } from './errors.js';
import { basicEnvNameProblem } from './env-names.js';
import { compileGlob, globMatches, globProblem, GLOB_LIMITS, type CompiledGlob } from './glob.js';

export { FoliwakeConfigError } from './errors.js';
export type { ClientSettings } from '@foliwake/blocks-contract/page';

/** The default config file name, looked up in the current directory. */
export const CONFIG_FILE = 'foliwake.remote.json';
/** The environment variable that names another config file. */
export const CONFIG_ENV = 'FOLIWAKE_REMOTE';
/** The channels a config can name. */
export const CHANNELS: readonly ChannelName[] = Object.freeze(['live', 'preview']);

/** HTTP Basic credentials: a user name and the NAME of the variable holding the password. */
export interface BasicAuth {
  type: 'basic';
  username: string;
  passwordEnv: string;
}

/**
 * A service token: each request carries a fresh ES256 JWT for its exact path, signed with the private key
 * in the variable `privateKeyEnv` (a JWK as JSON text). Delivery checks it with the public key of `kid`.
 */
export interface ServiceTokenAuth {
  type: 'service-token';
  /** The `iss` the delivery expects (its TOKEN_ISSUER). */
  issuer: string;
  /** The key id the delivery looks the public key up by. */
  kid: string;
  /** The NAME of the variable holding the private key. */
  privateKeyEnv: string;
}

/** The credential of an endpoint. */
export type RemoteAuth = BasicAuth | ServiceTokenAuth;

/** A channel's origin and its optional credential. */
export interface FoliwakeEndpoint {
  /** Origin only: scheme, host, port. */
  origin: string;
  auth: RemoteAuth | null;
}

/** The `app` part of the config, with defaults applied. */
export interface FoliwakeAppSettings {
  /** Page globs the app may read. */
  pages: readonly string[];
  /** App-origin URL prefixes of the proxies. */
  proxies: { code: string; media: string; pages: null };
  /** Where `mountBlocks` lives in a code release; null: bodies stay static. */
  blocks: { entry: string | null; contract: string; major: number; eventPrefix: string };
  /** Live media through a transforming host; null: media through the proxy. */
  media: { base: string; transform: 'cloudflare-images' | null } | null;
  /** Seconds before a cached envelope is stale (stale-while-revalidate). */
  revalidate: number;
}

/** A parsed and validated `foliwake.remote.json` (version 2). It holds credential variable names, never secrets. */
export interface FoliwakeAppConfig {
  version: 2;
  site: string;
  live: FoliwakeEndpoint | null;
  preview: FoliwakeEndpoint | null;
  /** Null only when parsed with `requireApp: false` (the engine CLI). */
  app: FoliwakeAppSettings | null;
  /** Where the config came from, for messages. */
  from: string;
}

/** Options of `parseFoliwakeConfig`. */
export interface ParseOptions {
  /** For messages (default foliwake.remote.json). */
  file?: string;
  /** Refuse a file without `app` (default true; the CLI passes false). */
  requireApp?: boolean;
  /** An additional rule for credential variable names (the engine CLI passes its own). */
  envNameProblem?: (name: string, what: string) => string | null;
}

const SECRET_KEYS =
  /^(password|passwd|pass|secret|token|apikey|api_key|authorization|credentials?|private_?key|signing_?key|jwk|d)$/i;
const ISSUER = /^[A-Za-z0-9._:/-]{1,256}$/;
const KID = /^[A-Za-z0-9._-]{1,128}$/;
const SITE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PREFIX = /^(?:\/[a-z0-9-]+)+$/;
const RESERVED_PREFIXES = ['/', '/_next', '/api', '/code', '/media'];
const ENTRY_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const ENTRY_ROOTS = ['scripts', 'components', '_foliwake'];
const CONTRACT = /^foliwake-blocks\/([1-9][0-9]{0,2})$/;
const EVENT_PREFIX = /^[a-z][a-z0-9-]{0,31}$/;
const DEFAULTS = { code: '/foliwake-code', media: '/foliwake-media', contract: 'foliwake-blocks/2', eventPrefix: 'block', revalidate: 300 };

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj => value !== null && typeof value === 'object' && !Array.isArray(value);

/** True for 127.x, localhost, *.localhost and ::1. */
export function isLoopbackName(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.$/, '');
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (name === '[::1]' || name === '::1') return true;
  return /^127(?:\.\d{1,3}){3}$/.test(name);
}

function safeUrlText(value: string): string {
  return value.replace(/\/\/[^/@]*@/, '//…@').slice(0, 200);
}

/** A site origin: https (http only for loopback), no credentials, path, query or fragment. */
export function parseRemoteUrl(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new FoliwakeConfigError(`${where}: give the URL of the deployed site, e.g. "https://preview.example.org".`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FoliwakeConfigError(`${where}: "${safeUrlText(value)}" is not a valid URL.`);
  }
  if (url.username || url.password) throw new FoliwakeConfigError(`${where}: the URL must not contain a user name or password; name the password's environment variable in "auth" instead.`);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FoliwakeConfigError(`${where}: only https URLs are supported.`);
  if (url.protocol === 'http:' && !isLoopbackName(url.hostname)) {
    throw new FoliwakeConfigError(`${where}: ${url.origin} uses plain http; use https (http is accepted only for loopback hosts such as 127.0.0.1).`);
  }
  if (url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new FoliwakeConfigError(`${where}: give the site origin only (scheme, host and port), without a path, query or fragment: ${url.origin}`);
  }
  return url.origin;
}

/** Validates an environment variable NAME (never a value). */
export function checkEnvName(value: unknown, where: string, extra?: ParseOptions['envNameProblem']): string {
  const problem = basicEnvNameProblem(value, where) ?? (extra ? extra(value as string, where) : null);
  if (problem) throw new FoliwakeConfigError(problem);
  return value as string;
}

/** Validates a Basic user name (no `:` or control characters, at most 128 characters). */
export function checkUsername(value: unknown, where: string): string {
  if (typeof value !== 'string' || value === '' || value.length > 128 || /[:\u0000-\u001f\u007f]/.test(value)) {
    throw new FoliwakeConfigError(`${where}: give a user name without ":" or control characters.`);
  }
  return value;
}

function refuseSecrets(value: unknown, at: string, file: string): void {
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

function onlyKeys(value: Obj, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new FoliwakeConfigError(`${where}: unknown key "${key}" (allowed: ${allowed.join(', ')}).`);
  }
}

function parseEndpoint(value: unknown, where: string, opts: ParseOptions): FoliwakeEndpoint {
  if (!isObject(value)) throw new FoliwakeConfigError(`${where}: must be an object {"url": …, "auth": …}.`);
  onlyKeys(value, ['url', 'auth'], where);
  const origin = parseRemoteUrl(value.url, `${where}.url`);
  if (value.auth === undefined || value.auth === null) return { origin, auth: null };
  return { origin, auth: parseAuth(value.auth, `${where}.auth`, opts) };
}

const AUTH_SHAPES =
  '{"type": "basic", "username": …, "passwordEnv": …} or ' +
  '{"type": "service-token", "issuer": …, "kid": …, "privateKeyEnv": …}';

function parseBasicAuth(auth: Obj, where: string, opts: ParseOptions): BasicAuth {
  onlyKeys(auth, ['type', 'username', 'passwordEnv'], where);
  return {
    type: 'basic',
    username: checkUsername(auth.username, `${where}.username`),
    passwordEnv: checkEnvName(auth.passwordEnv, `${where}.passwordEnv`, opts.envNameProblem),
  };
}

function parseServiceTokenAuth(auth: Obj, where: string, opts: ParseOptions): ServiceTokenAuth {
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

function parseAuth(auth: unknown, where: string, opts: ParseOptions): RemoteAuth {
  if (!isObject(auth)) throw new FoliwakeConfigError(`${where}: must be ${AUTH_SHAPES}.`);
  if (auth.type === 'basic') return parseBasicAuth(auth, where, opts);
  if (auth.type === 'service-token') return parseServiceTokenAuth(auth, where, opts);
  throw new FoliwakeConfigError(`${where}.type: "basic" or "service-token"; the auth must be ${AUTH_SHAPES}.`);
}

function parsePrefix(value: unknown, fallback: string, where: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !PREFIX.test(value)) throw new FoliwakeConfigError(`${where}: an absolute app path of [a-z0-9-] segments, such as "${fallback}".`);
  return value;
}

function parseProxies(value: unknown, where: string): FoliwakeAppSettings['proxies'] {
  if (value === undefined) return { code: DEFAULTS.code, media: DEFAULTS.media, pages: null };
  if (!isObject(value)) throw new FoliwakeConfigError(`${where}: must be an object {"code": …, "media": …, "pages": null}.`);
  onlyKeys(value, ['code', 'media', 'pages'], where);
  if (value.pages !== undefined && value.pages !== null) throw new FoliwakeConfigError(`${where}.pages: must be null in this version (the pages proxy comes with client-side reads).`);
  const proxies = { code: parsePrefix(value.code, DEFAULTS.code, `${where}.code`), media: parsePrefix(value.media, DEFAULTS.media, `${where}.media`), pages: null };
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

function parseEntry(value: unknown, where: string): string | null {
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

function parseBlocks(value: unknown, where: string): FoliwakeAppSettings['blocks'] {
  const blocks = value === undefined ? {} : value;
  if (!isObject(blocks)) throw new FoliwakeConfigError(`${where}: must be an object {"entry": …, "contract": …, "eventPrefix": …}.`);
  onlyKeys(blocks, ['entry', 'contract', 'eventPrefix'], where);
  const contract = blocks.contract === undefined ? DEFAULTS.contract : blocks.contract;
  const match = typeof contract === 'string' ? CONTRACT.exec(contract) : null;
  if (!match) throw new FoliwakeConfigError(`${where}.contract: "foliwake-blocks/<major>", such as "foliwake-blocks/2".`);
  const eventPrefix = blocks.eventPrefix === undefined ? DEFAULTS.eventPrefix : blocks.eventPrefix;
  if (typeof eventPrefix !== 'string' || !EVENT_PREFIX.test(eventPrefix)) throw new FoliwakeConfigError(`${where}.eventPrefix: [a-z][a-z0-9-], at most 32 characters.`);
  return { entry: parseEntry(blocks.entry, `${where}.entry`), contract: contract as string, major: Number(match[1]), eventPrefix };
}

function parseMedia(value: unknown, where: string): FoliwakeAppSettings['media'] {
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

function parsePages(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > GLOB_LIMITS.globsPerList) {
    throw new FoliwakeConfigError(`${where}: a list of 1–${GLOB_LIMITS.globsPerList} page globs, such as ["/lessons/**"].`);
  }
  return value.map((glob, i) => {
    const problem = typeof glob === 'string' ? globProblem(glob) : 'must be a string';
    if (problem) throw new FoliwakeConfigError(`${where}[${i}]: ${problem}.`);
    return glob as string;
  });
}

function parseApp(value: unknown, where: string): FoliwakeAppSettings {
  if (!isObject(value)) throw new FoliwakeConfigError(`${where}: must be an object {"pages": […], …}.`);
  onlyKeys(value, ['pages', 'proxies', 'blocks', 'media', 'revalidate'], where);
  const revalidate = value.revalidate === undefined ? DEFAULTS.revalidate : value.revalidate;
  if (typeof revalidate !== 'number' || !Number.isInteger(revalidate) || revalidate < 1 || revalidate > 86_400) {
    throw new FoliwakeConfigError(`${where}.revalidate: whole seconds between 1 and 86400.`);
  }
  return {
    pages: Object.freeze(parsePages(value.pages, `${where}.pages`)),
    proxies: parseProxies(value.proxies, `${where}.proxies`),
    blocks: parseBlocks(value.blocks, `${where}.blocks`),
    media: parseMedia(value.media, `${where}.media`),
    revalidate,
  };
}

/** Parses the text of a version 2 config. Throws FoliwakeConfigError with a message that names the field. */
export function parseFoliwakeConfig(text: string, opts: ParseOptions = {}): FoliwakeAppConfig {
  const file = opts.file ?? CONFIG_FILE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new FoliwakeConfigError(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  if (!isObject(parsed)) throw new FoliwakeConfigError(`${file} must be a JSON object {"version": 2, "site": …, "live": …, "preview": …, "app": …}.`);
  refuseSecrets(parsed, '', file);
  onlyKeys(parsed, ['$schema', '$comment', 'version', 'site', 'live', 'preview', 'app'], file);
  if (parsed.version === 1) {
    throw new FoliwakeConfigError(`${file}: version 1 is no longer read. Rewrite it as version 2: add "version": 2 and "site": "<site name>" (docs: website/guide/embed-in-react.md, "The config file").`);
  }
  if (parsed.version !== 2) throw new FoliwakeConfigError(`${file}: "version" must be 2.`);
  if (typeof parsed.site !== 'string' || !SITE.test(parsed.site)) throw new FoliwakeConfigError(`${file} "site": the site name, [a-z0-9-], such as "my-site".`);
  const live = parsed.live === undefined ? null : parseEndpoint(parsed.live, `${file} "live"`, opts);
  const preview = parsed.preview === undefined ? null : parseEndpoint(parsed.preview, `${file} "preview"`, opts);
  if (!live && !preview) throw new FoliwakeConfigError(`${file}: give at least one of "live" and "preview".`);
  const requireApp = opts.requireApp ?? true;
  if (parsed.app === undefined && requireApp) throw new FoliwakeConfigError(`${file}: "app" is required for an app (at least {"pages": ["/**"]}).`);
  const app = parsed.app === undefined ? null : parseApp(parsed.app, `${file} "app"`);
  return Object.freeze({ version: 2, site: parsed.site, live, preview, app, from: file });
}

/** The endpoint of a channel; a missing one is an error, never replaced by the other channel. */
export function endpointOf(config: FoliwakeAppConfig, channel: ChannelName): FoliwakeEndpoint {
  const endpoint = config[channel];
  if (!endpoint) {
    const other = channel === 'preview' ? 'live' : 'preview';
    throw new FoliwakeConfigError(`${config.from} has no "${channel}" endpoint. ${channel === 'preview' ? 'Preview' : 'Live'} is never replaced by ${other}: add "${channel}".`);
  }
  return endpoint;
}

/** The app settings; throws when the config has none. */
export function appOf(config: FoliwakeAppConfig): FoliwakeAppSettings {
  if (!config.app) throw new FoliwakeConfigError(`${config.from}: "app" is required for an app.`);
  return config.app;
}

const compiled = new WeakMap<FoliwakeAppSettings, CompiledGlob[]>();
/** Whether the app may read this page path (`app.pages`). */
export function pageAllowed(config: FoliwakeAppConfig, pagePath: string): boolean {
  const app = appOf(config);
  let globs = compiled.get(app);
  if (!globs) compiled.set(app, (globs = app.pages.map(compileGlob)));
  return globs.some((glob) => globMatches(glob, pagePath));
}

/** Which file: an explicit `file` beats FOLIWAKE_REMOTE beats `<cwd>/foliwake.remote.json`. */
export function configFilePath(opts: { cwd?: string; file?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  return path.resolve(cwd, opts.file ?? env[CONFIG_ENV] ?? CONFIG_FILE);
}

/** Reads and parses the config file (see configFilePath). */
export async function loadFoliwakeConfig(opts: { cwd?: string; file?: string; env?: NodeJS.ProcessEnv } & Omit<ParseOptions, 'file'> = {}): Promise<FoliwakeAppConfig> {
  const file = configFilePath(opts);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new FoliwakeConfigError(`${file} does not exist. Create ${CONFIG_FILE} (or set ${CONFIG_ENV} to another file).`);
    throw new FoliwakeConfigError(`Cannot read ${file}: ${(error as Error).message}`);
  }
  return parseFoliwakeConfig(text, { ...opts, file: path.basename(file) });
}

/** The explicit browser projection: nothing else of the config reaches a browser. */
export function clientSettings(config: FoliwakeAppConfig): ClientSettings {
  const app = appOf(config);
  return {
    site: config.site,
    proxies: { code: app.proxies.code, media: app.proxies.media, pages: app.proxies.pages },
    blocks: { contract: app.blocks.contract, eventPrefix: app.blocks.eventPrefix },
  };
}
