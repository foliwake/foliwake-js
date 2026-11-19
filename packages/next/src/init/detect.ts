// What `init` learns about the app before it writes anything: Next and its version, the app folder, TypeScript,
// next.config, the package manager, @foliwake/next, git. Reads only; nothing here writes.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Lang } from './templates.js';

/** The oldest Next the package supports. */
export const MIN_NEXT = [16, 2] as const;

const CONFIG_NAMES = ['next.config.ts', 'next.config.mjs', 'next.config.js', 'next.config.cjs'];
const LOCKFILES: [string, string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

/** The app as found. */
export interface Project {
  cwd: string;
  /** `app` or `src/app`, relative to cwd. */
  appDir: string;
  /** `.` or `src`: where the generated helper module goes. */
  sourceDir: string;
  lang: Lang;
  /** next.config file name, or null. */
  nextConfig: string | null;
  packageManager: string;
  /** The Next version as declared or installed, or null when it is not a version number. */
  nextVersion: string | null;
  hasFoliwakeNext: boolean;
  /** true clean, false dirty, null not a git checkout. */
  gitClean: boolean | null;
}

/** A problem that stops init before it writes anything. */
export class InitError extends Error {
  override name = 'InitError';
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function dependencies(manifest: Record<string, unknown>): Record<string, string> {
  return { ...(manifest.devDependencies ?? {}), ...(manifest.dependencies ?? {}) } as Record<string, string>;
}

function installedVersion(cwd: string, name: string): string | null {
  const manifest = readJson(path.join(cwd, 'node_modules', name, 'package.json'));
  return typeof manifest?.version === 'string' ? manifest.version : null;
}

/** `16.2.12`, `^16.2.0`, `~16.3` → [major, minor]; null for tags and ranges it cannot read. */
export function majorMinor(version: string | null): [number, number] | null {
  const match = version === null ? null : /^[\^~>=v\s]*(\d+)\.(\d+)/.exec(version);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/** Whether a version is at least MIN_NEXT; null when unknown. */
export function supportsNext(version: string | null): boolean | null {
  const parsed = majorMinor(version);
  if (parsed === null) return null;
  return parsed[0] > MIN_NEXT[0] || (parsed[0] === MIN_NEXT[0] && parsed[1] >= MIN_NEXT[1]);
}

function appDirOf(cwd: string): string {
  if (existsSync(path.join(cwd, 'app'))) return 'app';
  if (existsSync(path.join(cwd, 'src/app'))) return 'src/app';
  throw new InitError('No app/ or src/app/ folder: @foliwake/next needs the App Router.');
}

function packageManagerOf(cwd: string): string {
  const agent = process.env.npm_config_user_agent?.split('/')[0];
  const locked = LOCKFILES.find(([file]) => existsSync(path.join(cwd, file)));
  return locked?.[1] ?? agent ?? 'npm';
}

function gitCleanOf(cwd: string): boolean | null {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  if (status.status !== 0) return null;
  return status.stdout.trim() === '';
}

/** Reads the app at `cwd`. Throws InitError when it is not a Next App Router app. */
export function detectProject(cwd: string): Project {
  const manifest = readJson(path.join(cwd, 'package.json'));
  if (manifest === null) throw new InitError(`No package.json in ${cwd}: run init in the Next app's folder.`);
  const deps = dependencies(manifest);
  if (deps.next === undefined) throw new InitError('This package.json has no "next" dependency.');
  const appDir = appDirOf(cwd);
  return {
    cwd,
    appDir,
    sourceDir: appDir === 'src/app' ? 'src' : '.',
    lang: existsSync(path.join(cwd, 'tsconfig.json')) ? 'ts' : 'js',
    nextConfig: CONFIG_NAMES.find((name) => existsSync(path.join(cwd, name))) ?? null,
    packageManager: packageManagerOf(cwd),
    nextVersion: installedVersion(cwd, 'next') ?? deps.next ?? null,
    hasFoliwakeNext: deps['@foliwake/next'] !== undefined,
    gitClean: gitCleanOf(cwd),
  };
}
