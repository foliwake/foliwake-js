// The environment and local folders this CLI reads: FOLIWAKE_* settings, the settings folder, the
// browser, and loopback hosts (the only ones plain http may name).
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

/** The command people type. */
export const COMMAND = 'foliwake';

const ENV_PREFIX = 'FOLIWAKE_';

/** Reads `FOLIWAKE_<name>` from the environment, e.g. setting('SERVER'). Empty counts as unset. */
export function setting(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[`${ENV_PREFIX}${name}`];
  return value === '' ? undefined : value;
}

/** `$FOLIWAKE_CONFIG_DIR`, else `$XDG_CONFIG_HOME/foliwake`, else `~/.config/foliwake`. */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const own = setting('CONFIG_DIR', env);
  if (own) return path.resolve(own);
  const xdg = env.XDG_CONFIG_HOME;
  return path.join(xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), '.config'), 'foliwake');
}

/** True for 127.0.0.1, localhost, [::1] and *.localhost, with or without a port. */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (typeof hostHeader !== 'string') return false;
  const host = hostHeader.trim().toLowerCase();
  if (host === '') return false;
  if (host.startsWith('[')) return /^\[::1\](:\d+)?$/.test(host);
  const match = /^([^:]+)(:\d+)?$/.exec(host);
  if (!match) return false;
  const name = match[1].endsWith('.') ? match[1].slice(0, -1) : match[1];
  return name === '127.0.0.1' || name === 'localhost' || name.endsWith('.localhost');
}

/** Opens a URL in this computer's browser (open, xdg-open; nothing on Windows); callers print it too. */
export function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? null : 'xdg-open';
  if (!command) return;
  const child = spawn(command, [url], { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}
