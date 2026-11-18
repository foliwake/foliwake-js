// Local working files of `dev --remote`: path decoding and the code directories components/, scripts/,
// styles/ and references/, read from the working directory on every request (no cache).
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ServerResponse } from 'node:http';

import { CODE_ASSET_TYPES } from '@foliwake/site-check/formats/code-files';

import { KIT_FILES, KIT_PREFIX, isKitFile, kitFileBytes } from './kit-files.js';

export { isKitFile };

/** An SVG is served so that it cannot run script, as a code release serves it. */
const SVG_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
});

const codeFileHeaders = (extension: string): Readonly<Record<string, string>> =>
  extension === '.svg' ? SVG_HEADERS : {};

/** Code directories served from the working directory. */
export const CODE_PREFIXES: readonly string[] = ['components', 'scripts', 'styles', 'references'];

// The only file types allowed there: scripts, stylesheets, JSON, and the fonts and images they reference.
const CODE_TYPES: Readonly<Partial<Record<string, string>>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  ...CODE_ASSET_TYPES,
};

/** Headers of every dev response: never cached, never sniffed. */
export const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

/** Thrown for anything that is answered with the dev 404 page. */
export class NotFound extends Error {}

// The request method as Node reports it.
type Method = string | undefined;

/**
 * Splits the raw request path into decoded segments, rejecting anything that
 * could address a file outside the intended root (backslashes, NUL, encoded
 * slashes, `.` and `..` segments).
 */
export function decodeSegments(rawPath: string): string[] {
  if (/[\\\0]|%00|%2f|%5c/i.test(rawPath)) throw new NotFound();
  const segments = rawPath.split('/').slice(1);
  return segments.map((segment) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new NotFound();
    }
    if (decoded === '.' || decoded === '..' || /[\\/\0]/.test(decoded)) throw new NotFound();
    return decoded;
  });
}

async function isInside(baseDir: string, target: string): Promise<boolean> {
  const [realBase, realTarget] = await Promise.all([realpath(baseDir), realpath(target)]);
  return realTarget === realBase || realTarget.startsWith(realBase + path.sep);
}

async function sendFile(
  res: ServerResponse,
  absolutePath: string,
  contentType: string,
  method: Method,
  headers: Readonly<Record<string, string>> = {},
): Promise<void> {
  const info = await stat(absolutePath);
  if (!info.isFile()) throw new NotFound();
  res.writeHead(200, { ...BASE_HEADERS, ...headers, 'Content-Type': contentType, 'Content-Length': info.size });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    createReadStream(absolutePath).on('error', reject).on('end', resolve).pipe(res);
  });
}

/** Serves `<cwd>/<prefix>/<rest…>` (a code file of an allowed type inside that directory) or throws NotFound. */
export async function serveCodeFile(
  res: ServerResponse,
  cwd: string,
  prefix: string,
  rest: readonly string[],
  method: Method,
): Promise<void> {
  if (prefix === KIT_PREFIX) return serveKitFile(res, rest, method);
  if (rest.length === 0 || rest.some((s) => s === '' || s.startsWith('.'))) throw new NotFound();
  const extension = path.extname(rest[rest.length - 1]);
  const contentType = CODE_TYPES[extension];
  if (!contentType) throw new NotFound();
  const baseDir = path.join(cwd, prefix);
  const target = path.join(baseDir, ...rest);
  try {
    if (!(await isInside(baseDir, target))) throw new NotFound();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code; // realpath's system error, or the NotFound above (no code)
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new NotFound();
    throw error;
  }
  await sendFile(res, target, contentType, method, codeFileHeaders(extension));
}

// /_foliwake/<file>: a kit file (kit-files.ts), the same bytes for every site.
function serveKitFile(res: ServerResponse, rest: readonly string[], method: Method): void {
  if (!isKitFile([KIT_PREFIX, ...rest])) throw new NotFound();
  const bytes = kitFileBytes(rest[0]);
  res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': KIT_FILES[rest[0]], 'Content-Length': bytes.length });
  res.end(method === 'HEAD' ? undefined : bytes);
}
