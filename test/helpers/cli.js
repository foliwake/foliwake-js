// Runs the built `foliwake` of @foliwake/cli in a child process, with its own settings folder (no keychain:
// sign-ins go to the 0600 file) and the folder it runs in.
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BIN = fileURLToPath(new URL('../../packages/cli/dist/bin.js', import.meta.url));

/** A settings folder and a working folder for one test; `cleanup()` removes both. */
export async function cliHome() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliwake-cli-test-'));
  const env = { FOLIWAKE_CONFIG_DIR: path.join(root, 'config'), FOLIWAKE_KEYCHAIN_SERVICE: 'foliwake-cli-test' };
  return { root, cwd: root, env, cleanup: () => rm(root, { recursive: true, force: true }) };
}

const CLEAN_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('FOLIWAKE_')));

/** `foliwake <args>`: { code, stdout, stderr, json } (json: stdout parsed when it is JSON). */
export function runCli(args, { env = {}, cwd = process.cwd(), bin = BIN } = {}) {
  const options = { cwd, env: { ...CLEAN_ENV, NO_COLOR: '1', ...env }, encoding: 'utf8', timeout: 60_000 };
  return new Promise((resolve) => {
    execFile(process.execPath, [bin, ...args], options, (error, stdout, stderr) => {
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        json = null;
      }
      resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr, json });
    });
  });
}
