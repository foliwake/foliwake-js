// Where the app's Foliwake config comes from at run time: withFoliwake() validates the file at build time and
// inlines it (Next `env`) into server code only (this module is imported from server-only modules). Without
// withFoliwake, the file is read on first use (FOLIWAKE_REMOTE or ./foliwake.remote.json).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { configFilePath, parseFoliwakeConfig, type FoliwakeAppConfig } from '@foliwake/server/config';

/** The Next `env` key withFoliwake() sets. Not NEXT_PUBLIC_: never inlined into client code by name. */
export const CONFIG_ENV_KEY = 'FOLIWAKE_APP_CONFIG';

let cached: FoliwakeAppConfig | null = null;

export function loadConfigSync(): FoliwakeAppConfig {
  if (cached) return cached;
  const inlined = process.env.FOLIWAKE_APP_CONFIG;
  if (inlined) {
    const { file, text } = JSON.parse(inlined) as { file: string; text: string };
    cached = parseFoliwakeConfig(text, { file });
    return cached;
  }
  const file = configFilePath();
  cached = parseFoliwakeConfig(readFileSync(file, 'utf8'), { file: path.basename(file) });
  return cached;
}
