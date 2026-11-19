// @foliwake/next/config: next.config helpers.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { configFilePath, parseFoliwakeConfig, type FoliwakeAppConfig } from '@foliwake/server/config';
import { foliwakeCsp, type CspOptions } from '@foliwake/server/csp';
import { configFromSnapshot, readConfigSnapshot, URL_ENV } from '@foliwake/server/resolve';
import { CONFIG_ENV_KEY, type InlinedConfig } from './settings.js';

/** Options of `withFoliwake`. */
export interface WithFoliwakeOptions {
  /** The config file (default FOLIWAKE_REMOTE, else ./foliwake.remote.json). */
  configFile?: string;
  /**
   * Adds the Content-Security-Policy header (strategy 'self-inline': `script-src 'self' 'unsafe-inline'`) to the
   * routes matching `source` (default every route, `/:path*`). `reportUri` adds `report-uri`; `extra` adds sources
   * per directive. `false` (default): the app sets its own; use foliwakeCspHeader() for the value.
   */
  csp?: false | { reportUri?: string; extra?: CspOptions['extra']; source?: string };
}

/** What withFoliwake returns: the config itself, or (with FOLIWAKE_URL) a promise of it; Next accepts both. */
export type FoliwakeNextConfig = NextConfig | Promise<NextConfig>;

/** Options of `foliwakeCspHeader`. */
export interface CspHeaderOptions {
  configFile?: string;
  /** A config already read (withFoliwake passes it); default the version 2 file. */
  config?: FoliwakeAppConfig;
  reportUri?: string;
  extra?: CspOptions['extra'];
  dev?: boolean;
}

function readVersion2(configFile?: string): FoliwakeAppConfig {
  const file = configFilePath({ file: configFile });
  return parseFoliwakeConfig(readFileSync(file, 'utf8'), { file: path.basename(file) });
}

/** The CSP value for this app's config (strategy A, media base included, 'unsafe-eval' in development). */
export function foliwakeCspHeader(opts: CspHeaderOptions = {}): string {
  const config = opts.config ?? readVersion2(opts.configFile);
  return foliwakeCsp({
    strategy: 'self-inline',
    mediaBase: config.app?.media?.base ?? null,
    dev: opts.dev ?? process.env.NODE_ENV === 'development',
    ...(opts.reportUri ? { reportUri: opts.reportUri } : {}),
    ...(opts.extra ? { extra: opts.extra } : {}),
  });
}

function readFileText(configFile?: string): { file: string; text: string } {
  const file = configFilePath({ file: configFile });
  try {
    return { file: path.basename(file), text: readFileSync(file, 'utf8') };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'error';
    throw new Error(`withFoliwake: cannot read ${file} (${code}). Set ${URL_ENV}, or create foliwake.remote.json.`);
  }
}

/** The Next config with the inlined config, transpilePackages and (optionally) the CSP header. */
function wrapped(nextConfig: NextConfig, opts: WithFoliwakeOptions, inlined: InlinedConfig, config: FoliwakeAppConfig) {
  const transpile = new Set([...(nextConfig.transpilePackages ?? []), '@foliwake/next']);
  const out: NextConfig = {
    ...nextConfig,
    transpilePackages: [...transpile],
    env: { ...(nextConfig.env ?? {}), [CONFIG_ENV_KEY]: JSON.stringify(inlined) },
  };
  if (!opts.csp) return out;
  const csp = opts.csp;
  const previous = nextConfig.headers;
  out.headers = async () => {
    const own = previous ? await previous() : [];
    const value = foliwakeCspHeader({ config, reportUri: csp.reportUri, extra: csp.extra });
    return [...own, { source: csp.source ?? '/:path*', headers: [{ key: 'Content-Security-Policy', value }] }];
  };
  return out;
}

async function withDiscovery(nextConfig: NextConfig, opts: WithFoliwakeOptions): Promise<NextConfig> {
  try {
    const snapshot = await readConfigSnapshot(opts.configFile ? { file: opts.configFile } : {});
    return wrapped(nextConfig, opts, { snapshot }, configFromSnapshot(snapshot));
  } catch (error) {
    throw new Error(`withFoliwake: ${(error as Error).message}`, { cause: error });
  }
}

/**
 * Reads and validates the Foliwake config when Next loads next.config (build and start) and makes it available to
 * the package's server-only modules (Next `env`, never to client code); adds the package to transpilePackages
 * (its 'use cache' read). With FOLIWAKE_URL, the site's discovery document is read now (and the optional
 * version 3 file merged): the result is a promise, and a failure fails the build naming the address and the
 * reason. Without it, the version 2 file is read as before. Nothing is fetched at run time.
 *
 * @param nextConfig - The app's own Next config; its `transpilePackages`, `env` and `headers` are kept.
 * @returns The Next config (or a promise of it) to export from next.config.ts.
 */
export function withFoliwake(nextConfig: NextConfig = {}, opts: WithFoliwakeOptions = {}): FoliwakeNextConfig {
  if (process.env[URL_ENV]) return withDiscovery(nextConfig, opts);
  const { file, text } = readFileText(opts.configFile);
  const config = parseFoliwakeConfig(text, { file }); // throws a FoliwakeConfigError naming the field
  return wrapped(nextConfig, opts, { file, text }, config);
}
