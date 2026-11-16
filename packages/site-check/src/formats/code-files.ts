// File types of site code: one list for every place that captures, releases, serves or watches it.
// Scripts, stylesheets and JSON, plus the fonts and images that stylesheets and scripts reference.
// Extensions are matched as written (lower case), so a release names its files the way the browser requests them.

/** Script, stylesheet and data files of site code. */
export const CODE_SOURCE_EXTENSIONS: readonly string[] = Object.freeze(['.js', '.css', '.json']);

/** Fonts and images of site code, with the content type they are released and served with. */
export const CODE_ASSET_TYPES: Readonly<Record<string, string>> = Object.freeze({
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

/** Every extension site code may have (sources and assets). */
export const CODE_FILE_EXTENSIONS: readonly string[] = Object.freeze([
  ...CODE_SOURCE_EXTENSIONS,
  ...Object.keys(CODE_ASSET_TYPES),
]);

/** Whether an extension (e.g. ".woff2") is a type of site code. */
export function isCodeExtension(extension: string): boolean {
  return CODE_FILE_EXTENSIONS.includes(extension);
}

/**
 * The extension of the last segment of a posix path, with the dot, as `path.posix.extname` gives it:
 * "" when the name has no dot or only a leading one (".gitignore").
 */
export function extensionOf(relative: string): string {
  const name = relative.slice(relative.lastIndexOf('/') + 1);
  if (name === '..') return '';
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot);
}
