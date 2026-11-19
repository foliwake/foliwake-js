// Version 3: the app is configured by FOLIWAKE_URL. The site's discovery document gives the origins and the media
// CDN; `foliwake.remote.json` version 3 is optional and holds only the app's own decisions (overrides): pages,
// revalidate, proxies, media transform, blocks, and the credentials of each channel by variable NAME.
// Without FOLIWAKE_URL a version 2 file is read as before (./config).
import { CONFIG_FILE, type FoliwakeAppConfig, type FoliwakeAppSettings, type RemoteAuth } from './config.js';
import {
  DEFAULTS,
  isObject,
  onlyKeys,
  parseAuth,
  parseBlocks,
  parseMedia,
  parsePages,
  parseProxies,
  parseRevalidate,
  PROXY_DEFAULTS,
  refuseSecrets,
  type Obj,
} from './config-parts.js';
import type { FoliwakeDiscovery } from './discovery.js';
import { FoliwakeConfigError } from './errors.js';

/** The variable the default preview credential reads: Basic `preview:<site preview token>`. */
export const PREVIEW_TOKEN_ENV = 'FOLIWAKE_PREVIEW_TOKEN';

/** A parsed version 3 file: every part optional. */
export interface FoliwakeOverrides {
  site: string | null;
  liveAuth: RemoteAuth | null;
  previewAuth: RemoteAuth | null;
  app: Obj;
  from: string;
}

const APP_KEYS = ['pages', 'proxies', 'blocks', 'media', 'revalidate'];

function channelAuth(value: unknown, where: string): RemoteAuth | null {
  if (value === undefined) return null;
  if (!isObject(value)) throw new FoliwakeConfigError(`${where}: must be an object {"auth": …}.`);
  onlyKeys(value, ['auth'], where);
  return value.auth === undefined || value.auth === null ? null : parseAuth(value.auth, `${where}.auth`, {});
}

function parsedObject(text: string, file: string): Obj {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new FoliwakeConfigError(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  if (!isObject(parsed)) throw new FoliwakeConfigError(`${file} must be a JSON object {"version": 3, …}.`);
  refuseSecrets(parsed, '', file);
  return parsed;
}

/** Parses the text of a version 3 file. Throws FoliwakeConfigError naming the field. */
export function parseOverrides(text: string, file: string = CONFIG_FILE): FoliwakeOverrides {
  const parsed = parsedObject(text, file);
  onlyKeys(parsed, ['$schema', '$comment', 'version', 'site', 'live', 'preview', 'app'], file);
  if (parsed.version !== 3) throw new FoliwakeConfigError(`${file}: "version" must be 3 here.`);
  const app = parsed.app === undefined ? {} : parsed.app;
  if (!isObject(app)) throw new FoliwakeConfigError(`${file} "app": must be an object.`);
  onlyKeys(app, APP_KEYS, `${file} "app"`);
  if (parsed.site !== undefined && typeof parsed.site !== 'string') {
    throw new FoliwakeConfigError(`${file} "site": the site name, such as "my-site".`);
  }
  return {
    site: (parsed.site as string | undefined) ?? null,
    liveAuth: channelAuth(parsed.live, `${file} "live"`),
    previewAuth: channelAuth(parsed.preview, `${file} "preview"`),
    app,
    from: file,
  };
}

function defaultPreviewAuth(): RemoteAuth {
  return { type: 'basic', username: 'preview', passwordEnv: PREVIEW_TOKEN_ENV };
}

/** No `app.blocks`: the code release of each page names its blocks module (`X-Foliwake-Blocks`). */
function releaseBlocks(): FoliwakeAppSettings['blocks'] {
  return { entry: null, contract: DEFAULTS.contract, major: 2, eventPrefix: DEFAULTS.eventPrefix, fromRelease: true };
}

// `/**` is safe while live is read anonymously (the site's access rules decide). With a service token the app
// could read closed pages, so it must say which ones.
function pagesOf(app: Obj, liveAuth: RemoteAuth | null, where: string): readonly string[] {
  if (app.pages !== undefined) return Object.freeze(parsePages(app.pages, `${where}.pages`));
  if (liveAuth?.type === 'service-token') {
    throw new FoliwakeConfigError(`${where}.pages: required when "live" uses a service token (list the pages).`);
  }
  return Object.freeze(['/**']);
}

function mediaOf(app: Obj, discovery: FoliwakeDiscovery, where: string): FoliwakeAppSettings['media'] {
  if (app.media !== undefined) return parseMedia(app.media, `${where}.media`);
  return discovery.media ? { base: discovery.media.cdn, transform: null } : null;
}

function appSettings(overrides: FoliwakeOverrides, discovery: FoliwakeDiscovery): FoliwakeAppSettings {
  const { app } = overrides;
  const where = `${overrides.from} "app"`;
  return {
    pages: pagesOf(app, overrides.liveAuth, where),
    proxies: parseProxies(app.proxies, `${where}.proxies`, PROXY_DEFAULTS[3]),
    blocks: app.blocks === undefined ? releaseBlocks() : parseBlocks(app.blocks, `${where}.blocks`),
    media: mediaOf(app, discovery, where),
    revalidate: parseRevalidate(app.revalidate, `${where}.revalidate`),
  };
}

/** No file: the overrides of an empty version 3 file. */
export function emptyOverrides(): FoliwakeOverrides {
  return { site: null, liveAuth: null, previewAuth: null, app: {}, from: 'FOLIWAKE_URL' };
}

/**
 * The app config of a site: its discovery document, with the version 3 file's overrides. Preview, when the site
 * has it, is read with Basic `preview` and the token in FOLIWAKE_PREVIEW_TOKEN unless the file names another auth.
 */
export function resolveConfig(discovery: FoliwakeDiscovery, overrides = emptyOverrides()): FoliwakeAppConfig {
  if (overrides.site !== null && overrides.site !== discovery.site) {
    const text = `"site" is ${overrides.site}, but ${discovery.live.url} serves the site ${discovery.site}.`;
    throw new FoliwakeConfigError(`${overrides.from}: ${text}`);
  }
  const live = { origin: discovery.live.url, auth: overrides.liveAuth };
  const previewAuth = overrides.previewAuth ?? defaultPreviewAuth();
  const preview = discovery.preview ? { origin: discovery.preview.url, auth: previewAuth } : null;
  const app = appSettings(overrides, discovery);
  return Object.freeze({ version: 3, site: discovery.site, live, preview, app, from: overrides.from });
}
