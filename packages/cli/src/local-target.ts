// Where a core command's calls go: a server, or with the engine's runtime registered, this computer.
//   --server, then --config or $FOLIWAKE_CONFIG (local), then the folder's .foliwake/connection.json, then
//   $FOLIWAKE_SERVER, then ./foliwake.config.json in this folder (local), then the last `login`, else local.
// Without the engine nothing is local: null when nothing names a server.
import { localRuntime } from './local-runtime.js';
import { ServerAddressError, type Target, resolveTarget } from './remote/servers.js';
import { setting } from './settings.js';

export interface TargetFlags {
  server: string | undefined;
  config: string | undefined;
}

export function chooseTarget(
  { server, config }: TargetFlags,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Target | 'local' | null {
  const engine = localRuntime();
  if (!engine) return resolveTarget({ server }, env, cwd);
  if (server !== undefined && config !== undefined) {
    throw new ServerAddressError('Use either --server or --config, not both.');
  }
  if (server === undefined && (config !== undefined || setting('CONFIG', env))) return 'local';
  const target = resolveTarget({ server }, env, cwd);
  if (target && target.from !== 'login') return target;
  if (engine.folderConfig(cwd)) return 'local';
  return target ?? 'local';
}
