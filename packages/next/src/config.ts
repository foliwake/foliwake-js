// @foliwake/next/config: next.config helpers.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { configFilePath, parseFoliwakeConfig } from '@foliwake/server/config';
import { foliwakeCsp, type CspOptions } from '@foliwake/server/csp';
import { CONFIG_ENV_KEY } from './settings.js';

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

/** The CSP value for this app's config (strategy A, media base included, 'unsafe-eval' in development). */
export function foliwakeCspHeader(opts: { configFile?: string; reportUri?: string; extra?: CspOptions['extra']; dev?: boolean } = {}): string {
  const file = configFilePath({ file: opts.configFile });
  const config = parseFoliwakeConfig(readFileSync(file, 'utf8'), { file: path.basename(file) });
  return foliwakeCsp({
    strategy: 'self-inline',
    mediaBase: config.app?.media?.base ?? null,
    dev: opts.dev ?? process.env.NODE_ENV === 'development',
    ...(opts.reportUri ? { reportUri: opts.reportUri } : {}),
    ...(opts.extra ? { extra: opts.extra } : {}),
  });
}

/**
 * Validates the Foliwake config when Next loads next.config (build and start) and makes it available to the
 * package's server-only modules (Next `env`, never to client code); adds the package to transpilePackages
 * (its 'use cache' read). Throws when the file is missing or invalid, naming the field.
 *
 * @param nextConfig - The app's own Next config; its `transpilePackages`, `env` and `headers` are kept.
 * @returns The Next config to export from next.config.ts.
 */
export function withFoliwake(nextConfig: NextConfig = {}, opts: WithFoliwakeOptions = {}): NextConfig {
  const file = configFilePath({ file: opts.configFile });
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`withFoliwake: cannot read ${file} (${(error as NodeJS.ErrnoException).code ?? 'error'}). Create foliwake.remote.json or set FOLIWAKE_REMOTE.`);
  }
  parseFoliwakeConfig(text, { file: path.basename(file) }); // throws a FoliwakeConfigError naming the field
  const transpile = new Set([...(nextConfig.transpilePackages ?? []), '@foliwake/next']);
  const out: NextConfig = {
    ...nextConfig,
    transpilePackages: [...transpile],
    env: { ...(nextConfig.env ?? {}), [CONFIG_ENV_KEY]: JSON.stringify({ file: path.basename(file), text }) },
  };
  if (opts.csp) {
    const csp = opts.csp;
    const previous = nextConfig.headers;
    out.headers = async () => {
      const own = previous ? await previous() : [];
      const value = foliwakeCspHeader({ ...(opts.configFile ? { configFile: opts.configFile } : {}), ...(csp.reportUri ? { reportUri: csp.reportUri } : {}), ...(csp.extra ? { extra: csp.extra } : {}) });
      return [...own, { source: csp.source ?? '/:path*', headers: [{ key: 'Content-Security-Policy', value }] }];
    };
  }
  return out;
}
