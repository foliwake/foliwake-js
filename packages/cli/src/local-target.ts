// Where a core command's calls go: a server, or with the engine's runtime registered, this computer.
//   --server, then --config (local), then $FOLIWAKE_CONFIG (local) unless $FOLIWAKE_SERVER is set, then
//   --content with ./foliwake.config.json in this folder (local), then the folder's .foliwake/connection.json,
//   then $FOLIWAKE_SERVER, then ./foliwake.config.json in this folder (local), then the last `login`, else local.
// An explicit $FOLIWAKE_SERVER wins over $FOLIWAKE_CONFIG: the engine's Docker image sets FOLIWAKE_CONFIG for
// its own commands, and a CI job or an operator naming a server must reach it (flags still win over both).
// Without the engine nothing is local: null when nothing names a server.
import { localRuntime } from './local-runtime.js';
import { ServerAddressError, type Target, resolveTarget } from './remote/servers.js';
import { setting } from './settings.js';

export interface TargetFlags {
  server: string | undefined;
  config: string | undefined;
  /** `--content`: a folder on this computer, so the folder's configuration even in a linked folder. */
  content?: string | undefined;
}

export function chooseTarget(
  { server, config, content }: TargetFlags,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Target | 'local' | null {
  const engine = localRuntime();
  if (!engine) return resolveTarget({ server }, env, cwd);
  if (server !== undefined && config !== undefined) {
    throw new ServerAddressError('Use either --server or --config, not both.');
  }
  if (server === undefined && (config !== undefined || configFromEnv(env))) return 'local';
  // `page check --content ./x` in a linked folder: the local files, with this folder's configuration.
  if (server === undefined && content !== undefined && engine.folderConfig(cwd)) return 'local';
  const target = resolveTarget({ server }, env, cwd);
  if (target && target.from !== 'login') return target;
  if (engine.folderConfig(cwd)) return 'local';
  return target ?? 'local';
}

/** $FOLIWAKE_CONFIG names the local configuration only while $FOLIWAKE_SERVER names no server. */
function configFromEnv(env: NodeJS.ProcessEnv): boolean {
  return Boolean(setting('CONFIG', env)) && !setting('SERVER', env);
}
