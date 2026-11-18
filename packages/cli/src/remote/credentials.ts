// Where this computer keeps the CLI token of each server: the OS keychain (macOS Keychain, Linux Secret
// Service), or, only when asked for, a 0600 file. The service name and account keys are the engine CLI's,
// so either CLI reads a sign-in the other made. `FOLIWAKE_TOKEN` (CI) is read by the caller and stores nothing.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { configDir, setting } from '../settings.js';
import type { CredentialStoreKind } from './servers.js';

export interface CredentialStore {
  kind: CredentialStoreKind;
  get(key: string): string | null;
  set(key: string, token: string): void;
  delete(key: string): void;
}

export class CredentialStoreError extends Error {}

const serviceName = (env: NodeJS.ProcessEnv) => setting('KEYCHAIN_SERVICE', env) ?? 'foliwake';

function run(command: string, args: string[], input?: string): { status: number | null; stdout: string } {
  const options = { input, encoding: 'utf8' as const, stdio: 'pipe' as const, timeout: 15_000 };
  const result = spawnSync(command, args, options);
  if (result.error) throw new CredentialStoreError(`${command} could not run: ${result.error.message}`);
  return { status: result.status, stdout: result.stdout };
}

/** Keys and tokens hold no quotes (a key is an origin or "cloud"; a token is base64url). */
function quoted(value: string): string {
  if (/["\\\s]/.test(value)) throw new CredentialStoreError('This value cannot be stored in the keychain.');
  return `"${value}"`;
}

// Values go through `security -i` on stdin, so the token is never in a process's arguments.
function keychain(service: string): CredentialStore {
  const security = '/usr/bin/security';
  return {
    kind: 'keychain',
    get(key) {
      const found = run(security, ['find-generic-password', '-s', service, '-a', key, '-w']);
      return found.status === 0 ? found.stdout.trim() || null : null;
    },
    set(key, token) {
      const command = `add-generic-password -U -s ${quoted(service)} -a ${quoted(key)} -w ${quoted(token)}\n`;
      const result = run(security, ['-i'], command);
      if (result.status !== 0) throw new CredentialStoreError('The macOS Keychain refused to store the token.');
    },
    delete(key) {
      run(security, ['delete-generic-password', '-s', service, '-a', key]);
    },
  };
}

function secretService(service: string): CredentialStore {
  return {
    kind: 'secret-service',
    get(key) {
      const found = run('secret-tool', ['lookup', 'service', service, 'account', key]);
      return found.status === 0 ? found.stdout.trim() || null : null;
    },
    set(key, token) {
      const args = ['store', `--label=Foliwake ${key}`, 'service', service, 'account', key];
      const result = run('secret-tool', args, token);
      if (result.status !== 0) throw new CredentialStoreError('The Secret Service refused to store the token.');
    },
    delete(key) {
      run('secret-tool', ['clear', 'service', service, 'account', key]);
    },
  };
}

function readFileStore(where: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(where, 'utf8')) as Record<string, string>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

function writeFileStore(where: string, all: Record<string, string>): void {
  mkdirSync(path.dirname(where), { recursive: true, mode: 0o700 });
  const temp = `${where}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, where);
}

function file(env: NodeJS.ProcessEnv): CredentialStore {
  const where = path.join(configDir(env), 'credentials.json');
  return {
    kind: 'file',
    get: (key) => readFileStore(where)[key] ?? null,
    set: (key, token) => writeFileStore(where, { ...readFileStore(where), [key]: token }),
    delete(key) {
      const all = readFileStore(where);
      if (!(key in all)) return;
      delete all[key];
      writeFileStore(where, all);
    },
  };
}

const hasSecretTool = () => spawnSync('secret-tool', ['--version'], { stdio: 'ignore' }).error === undefined;

/** The store of this kind, as a profile names it. */
export function credentialStore(kind: CredentialStoreKind, env: NodeJS.ProcessEnv = process.env): CredentialStore {
  if (kind === 'keychain') return keychain(serviceName(env));
  if (kind === 'secret-service') return secretService(serviceName(env));
  return file(env);
}

/** The store a new sign-in uses: the OS keychain, or the file only when `insecureStorage` allows it. */
export function storeForSignIn(
  { insecureStorage }: { insecureStorage: boolean },
  env: NodeJS.ProcessEnv = process.env,
): CredentialStore {
  if (insecureStorage) return file(env);
  if (process.platform === 'darwin') return keychain(serviceName(env));
  if (process.platform === 'linux' && hasSecretTool()) return secretService(serviceName(env));
  throw new CredentialStoreError(
    'There is no system keychain here (on Linux: install libsecret-tools). Pass --insecure-storage to keep ' +
      'the token in a 0600 file, or set FOLIWAKE_TOKEN for CI.',
  );
}
