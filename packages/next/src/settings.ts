// Where the app's Foliwake config comes from at run time: withFoliwake() reads it at build time (the version 2 file,
// or FOLIWAKE_URL's discovery document with the optional version 3 file) and inlines a snapshot (Next `env`) into
// server code only (this module is imported from server-only modules). Without withFoliwake, a version 2 file is
// read on first use (FOLIWAKE_REMOTE or ./foliwake.remote.json); FOLIWAKE_URL needs withFoliwake.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { configFilePath, parseFoliwakeConfig, type FoliwakeAppConfig } from '@foliwake/server/config';
import { configFromSnapshot, URL_ENV, type FoliwakeConfigSnapshot } from '@foliwake/server/resolve';

/** The Next `env` key withFoliwake() sets. Not NEXT_PUBLIC_: never inlined into client code by name. */
export const CONFIG_ENV_KEY = 'FOLIWAKE_APP_CONFIG';

/** What withFoliwake inlines: a snapshot (version 3 / discovery), or a version 2 file's name and text. */
export type InlinedConfig = { snapshot: FoliwakeConfigSnapshot } | { file: string; text: string };

let cached: FoliwakeAppConfig | null = null;

/** The config of an inlined value. */
export function configOfInlined(inlined: InlinedConfig): FoliwakeAppConfig {
  if ('snapshot' in inlined) return configFromSnapshot(inlined.snapshot);
  return parseFoliwakeConfig(inlined.text, { file: inlined.file });
}

const NOT_WRAPPED =
  `${URL_ENV} is set, but next.config does not use withFoliwake(): the site's discovery document is read when ` +
  'Next loads next.config. Wrap the config: export default withFoliwake({ cacheComponents: true }).';

function readWithoutWrapper(): FoliwakeAppConfig {
  if (process.env[URL_ENV]) throw new Error(NOT_WRAPPED);
  const file = configFilePath();
  return parseFoliwakeConfig(readFileSync(file, 'utf8'), { file: path.basename(file) });
}

export function loadConfigSync(): FoliwakeAppConfig {
  if (cached) return cached;
  const inlined = process.env.FOLIWAKE_APP_CONFIG;
  cached = inlined ? configOfInlined(JSON.parse(inlined) as InlinedConfig) : readWithoutWrapper();
  return cached;
}
