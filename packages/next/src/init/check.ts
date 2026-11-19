// `init --check`: is this app set up? Reads files and asks the site; prints variable names, never values.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Project } from './detect.js';
import { verifySite } from './site.js';

/** One check. */
export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const PACKAGES = ['@foliwake/next', '@foliwake/server', '@foliwake/react'];

function read(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/** Files under `dir` (relative to cwd) whose text mentions `needle`, depth ≤ 4. */
function filesMentioning(cwd: string, dir: string, needle: string, depth = 4): string[] {
  const full = path.join(cwd, dir);
  if (depth < 0 || !existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return filesMentioning(cwd, relative, needle, depth - 1);
    return /\.(t|j)sx?$/.test(entry.name) && read(path.join(cwd, relative))?.includes(needle) ? [relative] : [];
  });
}

/** Env names set in the environment or in .env.local (values are never read out). */
function envNames(cwd: string, env: NodeJS.ProcessEnv): Set<string> {
  const local = read(path.join(cwd, '.env.local')) ?? '';
  const filled = [...local.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)/gm)].map((m) => m[1]!);
  return new Set([...filled, ...Object.keys(env).filter((name) => env[name])]);
}

function urlOf(cwd: string, env: NodeJS.ProcessEnv): string | null {
  const local = read(path.join(cwd, '.env.local')) ?? '';
  return env.FOLIWAKE_URL || (/^\s*FOLIWAKE_URL\s*=\s*(\S+)/m.exec(local)?.[1] ?? null);
}

function fileChecks(project: Project): CheckResult[] {
  const config = project.nextConfig ? read(path.join(project.cwd, project.nextConfig)) : null;
  const handler = filesMentioning(project.cwd, project.appDir, '@foliwake/next/handler');
  const page = filesMentioning(project.cwd, project.appDir, '@foliwake/next/page');
  const wrapped = config?.includes('withFoliwake') ?? false;
  return [
    { name: 'next.config uses withFoliwake()', ok: wrapped, detail: project.nextConfig ?? 'no next.config' },
    { name: 'route handler', ok: handler.length > 0, detail: handler.join(', ') || 'no route uses the handler' },
    { name: 'page route', ok: page.length > 0, detail: page.join(', ') || 'no page uses @foliwake/next/page' },
  ];
}

function envChecks(project: Project, env: NodeJS.ProcessEnv): CheckResult[] {
  const names = envNames(project.cwd, env);
  const preview = filesMentioning(project.cwd, project.appDir, "channel: 'preview'").length > 0;
  const checks = [{ name: 'FOLIWAKE_URL is set', ok: names.has('FOLIWAKE_URL'), detail: 'env or .env.local' }];
  if (preview) {
    const ok = names.has('FOLIWAKE_PREVIEW_TOKEN');
    checks.push({ name: 'FOLIWAKE_PREVIEW_TOKEN is set (preview route found)', ok, detail: 'value not shown' });
  }
  return checks;
}

function versionChecks(project: Project): CheckResult[] {
  const versions = PACKAGES.map((name) => {
    const manifest = read(path.join(project.cwd, 'node_modules', name, 'package.json'));
    return `${name}@${manifest ? (JSON.parse(manifest) as { version: string }).version : 'missing'}`;
  });
  const distinct = new Set(versions.map((v) => v.split('@').at(-1)));
  const ok = distinct.size === 1 && !distinct.has('missing');
  return [{ name: '@foliwake packages share one version', ok, detail: versions.join(', ') }];
}

async function siteChecks(project: Project, env: NodeJS.ProcessEnv, doFetch?: typeof fetch): Promise<CheckResult[]> {
  const url = urlOf(project.cwd, env);
  if (url === null) return [];
  try {
    const facts = await verifySite(url, doFetch);
    const detail = facts.note ?? `site ${facts.site}, X-Code-Release present`;
    return [{ name: `${url} answers discovery and plain/2`, ok: facts.note === null, detail }];
  } catch (error) {
    return [{ name: `${url} answers discovery and plain/2`, ok: false, detail: (error as Error).message }];
  }
}

/** Every check of an existing setup. */
export async function checkSetup(
  project: Project,
  env: NodeJS.ProcessEnv,
  doFetch?: typeof fetch,
): Promise<CheckResult[]> {
  const local = [...fileChecks(project), ...envChecks(project, env), ...versionChecks(project)];
  return [...local, ...(await siteChecks(project, env, doFetch))];
}
