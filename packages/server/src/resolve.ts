// Where an app's config comes from: FOLIWAKE_URL (the site's discovery document) with an optional version 3
// file, or a version 2 file alone. The inputs are read once into a snapshot (plain JSON: an app framework can
// inline it at build time, so nothing is fetched at run time); the config is computed from the snapshot.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_ENV, CONFIG_FILE, configFilePath, parseFoliwakeConfig, type FoliwakeAppConfig } from './config.js';
import { parseOverrides, resolveConfig } from './config-v3.js';
import { fetchDiscovery, URL_ENV, type FetchDiscoveryOptions, type FoliwakeDiscovery } from './discovery.js';
import { FoliwakeConfigError } from './errors.js';

export { PREVIEW_TOKEN_ENV } from './config-v3.js';
export { DISCOVERY_PATH, URL_ENV, type FoliwakeDiscovery } from './discovery.js';

/** The inputs of an app's config, as plain JSON. */
export interface FoliwakeConfigSnapshot {
  /** FOLIWAKE_URL, or null. */
  url: string | null;
  /** The site's discovery document read from `url`, or null without it. */
  discovery: FoliwakeDiscovery | null;
  /** The config file's name (for messages) and text, or null when there is none. */
  file: string | null;
  text: string | null;
}

/** Options of `readConfigSnapshot` and `loadAppConfig`. */
export interface ReadSnapshotOptions extends FetchDiscoveryOptions {
  cwd?: string;
  /** Default process.env: FOLIWAKE_URL, FOLIWAKE_REMOTE. */
  env?: NodeJS.ProcessEnv;
  /** The config file (default FOLIWAKE_REMOTE, else ./foliwake.remote.json). */
  file?: string;
}

async function readOptionalFile(file: string, required: boolean): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' && !required) return null;
    if (code === 'ENOENT') throw new FoliwakeConfigError(`${file} does not exist.`);
    throw new FoliwakeConfigError(`Cannot read ${file}: ${(error as Error).message}`);
  }
}

const NOTHING =
  `Set ${URL_ENV} to the site's live URL (https://…), ` + `or create ${CONFIG_FILE} (version 2) in the app's root.`;

/**
 * Reads the inputs: FOLIWAKE_URL and its discovery document (fetched now), and the config file when there is one
 * (a file named explicitly or by FOLIWAKE_REMOTE must exist). Throws FoliwakeConfigError.
 */
export async function readConfigSnapshot(opts: ReadSnapshotOptions = {}): Promise<FoliwakeConfigSnapshot> {
  const env = opts.env ?? process.env;
  const url = env[URL_ENV]?.trim() || null;
  const file = configFilePath({ cwd: opts.cwd, file: opts.file, env });
  const named = opts.file !== undefined || env[CONFIG_ENV] !== undefined;
  const text = await readOptionalFile(file, named);
  if (url === null && text === null) throw new FoliwakeConfigError(NOTHING);
  const discovery = url === null ? null : await fetchDiscovery(url, opts);
  return { url, discovery, file: text === null ? null : path.basename(file), text };
}

function versionOf(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as { version?: unknown }).version : undefined;
  } catch {
    return undefined; // the parser names the problem
  }
}

function withVersion2(discovery: FoliwakeDiscovery, text: string, file: string): FoliwakeAppConfig {
  const config = parseFoliwakeConfig(text, { file });
  if (config.site !== discovery.site) {
    const text = `"site" is ${config.site}, but ${URL_ENV} serves the site ${discovery.site}.`;
    throw new FoliwakeConfigError(`${file}: ${text} Make them agree, or drop one.`);
  }
  return config;
}

/** The app config of a snapshot (no I/O). Throws FoliwakeConfigError naming the field. */
export function configFromSnapshot(snapshot: FoliwakeConfigSnapshot): FoliwakeAppConfig {
  const { discovery, text } = snapshot;
  const file = snapshot.file ?? CONFIG_FILE;
  if (discovery === null) {
    if (text === null) throw new FoliwakeConfigError(NOTHING);
    return parseFoliwakeConfig(text, { file });
  }
  if (text === null) return resolveConfig(discovery);
  if (versionOf(text) === 2) return withVersion2(discovery, text, file);
  return resolveConfig(discovery, parseOverrides(text, file));
}

/** readConfigSnapshot, then configFromSnapshot. */
export async function loadAppConfig(opts: ReadSnapshotOptions = {}): Promise<FoliwakeAppConfig> {
  return configFromSnapshot(await readConfigSnapshot(opts));
}
