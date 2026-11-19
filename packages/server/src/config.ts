// `foliwake.remote.json` version 2 (schema schemas/remote-2.schema.json):
// which Foliwake site an app reads, with which credential NAMES, and the app's settings. One parser for the
// engine CLI (`foliwake dev --remote`) and the app packages.
//
// No secrets: anything that looks like a stored secret refuses the file; credentials are variable names,
// read on the server per origin request (./origin), never logged, never sent to a browser.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChannelName, ClientSettings } from '@foliwake/blocks-contract/page';
import { FoliwakeConfigError } from './errors.js';
import { compileGlob, globMatches, type CompiledGlob } from './glob.js';
import { isObject, onlyKeys, parseApp, parseEndpoint, refuseSecrets, SITE } from './config-parts.js';

export { FoliwakeConfigError } from './errors.js';
export { checkEnvName, checkUsername, isLoopbackName, parseRemoteUrl } from './config-checks.js';
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
  /**
   * Where `mountBlocks` lives in a code release; null: bodies stay static. `fromRelease`: the config names no
   * blocks (version 3), so each page's code release names them (`X-Foliwake-Blocks`); false for version 2.
   */
  blocks: { entry: string | null; contract: string; major: number; eventPrefix: string; fromRelease: boolean };
  /** Live media through a transforming host; null: media through the proxy. */
  media: { base: string; transform: 'cloudflare-images' | null } | null;
  /** Seconds before a cached envelope is stale (stale-while-revalidate). */
  revalidate: number;
}

/**
 * A validated app config: a `foliwake.remote.json` version 2, or (version 3) the site's discovery document merged
 * with the optional version 3 file. It holds credential variable names, never secrets.
 */
export interface FoliwakeAppConfig {
  version: 2 | 3;
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

function unsupportedVersion(file: string, version: unknown): FoliwakeConfigError {
  if (version === 3) {
    return new FoliwakeConfigError(`${file}: version 3 holds overrides only; set FOLIWAKE_URL to the site's URL.`);
  }
  return new FoliwakeConfigError(`${file}: unsupported "version" ${JSON.stringify(version)}; it must be 2.`);
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
  if (parsed.version !== 2) throw unsupportedVersion(file, parsed.version);
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
