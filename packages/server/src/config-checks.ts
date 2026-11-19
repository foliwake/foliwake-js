// Checks of single config values shared by the v2 and v3 parsers and the discovery reader: origins and variable
// names. Re-exported by ./config (the public module).
import { FoliwakeConfigError } from './errors.js';
import { basicEnvNameProblem } from './env-names.js';
import type { ParseOptions } from './config.js';

/** True for 127.x, localhost, *.localhost and ::1. */
export function isLoopbackName(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.$/, '');
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (name === '[::1]' || name === '::1') return true;
  return /^127(?:\.\d{1,3}){3}$/.test(name);
}

function safeUrlText(value: string): string {
  return value.replace(/\/\/[^/@]*@/, '//…@').slice(0, 200);
}

/** A site origin: https (http only for loopback), no credentials, path, query or fragment. */
export function parseRemoteUrl(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new FoliwakeConfigError(`${where}: give the URL of the deployed site, e.g. "https://preview.example.org".`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FoliwakeConfigError(`${where}: "${safeUrlText(value)}" is not a valid URL.`);
  }
  if (url.username || url.password) throw new FoliwakeConfigError(`${where}: the URL must not contain a user name or password; name the password's environment variable in "auth" instead.`);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FoliwakeConfigError(`${where}: only https URLs are supported.`);
  if (url.protocol === 'http:' && !isLoopbackName(url.hostname)) {
    throw new FoliwakeConfigError(`${where}: ${url.origin} uses plain http; use https (http is accepted only for loopback hosts such as 127.0.0.1).`);
  }
  if (url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new FoliwakeConfigError(`${where}: give the site origin only (scheme, host and port), without a path, query or fragment: ${url.origin}`);
  }
  return url.origin;
}

/** Validates an environment variable NAME (never a value). */
export function checkEnvName(value: unknown, where: string, extra?: ParseOptions['envNameProblem']): string {
  const problem = basicEnvNameProblem(value, where) ?? (extra ? extra(value as string, where) : null);
  if (problem) throw new FoliwakeConfigError(problem);
  return value as string;
}

/** Validates a Basic user name (no `:` or control characters, at most 128 characters). */
export function checkUsername(value: unknown, where: string): string {
  if (typeof value !== 'string' || value === '' || value.length > 128 || /[:\u0000-\u001f\u007f]/.test(value)) {
    throw new FoliwakeConfigError(`${where}: give a user name without ":" or control characters.`);
  }
  return value;
}
