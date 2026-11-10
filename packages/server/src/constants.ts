// Engine constants this package needs. @foliwake/release-formats is not published, so they are copied;
// test/packages/server-constants.test.js asserts they equal the engine's.

/** A code release id (release-formats `CODE_ID_PATTERN`). */
export const CODE_ID_PATTERN = /^cd_[0-9a-f]{32,64}$/;

/** Every file type site code may have, with the content type the proxy requires (release-formats code-files). */
export const CODE_FILE_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
});

/** The sandbox an SVG code file is served with (release-formats `codeFileHeaders('.svg')`). */
export const SVG_CODE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

/** First segments of a path inside a code release the proxy serves. */
export const CODE_ROOTS: readonly string[] = Object.freeze(['components', 'scripts', 'styles', '_foliwake']);

/** A media key as the engine writes it: `<sha256>.<ext>`, images only (SVG refused in 0.1). */
export const MEDIA_KEY_PATTERN = /^[0-9a-f]{64}\.(png|jpe?g|webp|gif|avif)$/;
export const MEDIA_TYPES: Readonly<Record<string, string>> = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
});

/** One segment of a path inside a code release, after a single decode. */
export const CODE_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/** A Foliwake page path: `/` or `/`-separated lower-case segments. */
export const PAGE_PATH_PATTERN = /^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?$/;

/** Limits (bytes, ms). */
export const LIMITS = Object.freeze({
  body: 2 * 1024 * 1024,
  code: 5 * 1024 * 1024,
  media: 25 * 1024 * 1024,
  timeoutMs: 10_000,
  depth: 200,
});
