// The layout of a site code repository: which paths the platform captures into a code release, which files
// every release needs, and which files the engine generates (never inputs). A release is captured from the
// code roots and the root files below; nothing else in the repository is read (content/ never is).
import { CODE_FILE_EXTENSIONS, extensionOf } from './code-files.js';

/** The folders of site code. */
export const CODE_ROOTS: readonly string[] = Object.freeze([
  'components',
  'scripts',
  'styles',
  'templates',
  'references',
]);

/** Release-root files captured by exact name; nothing else at the root is an input. */
export const CODE_ROOT_FILES: readonly string[] = Object.freeze(['query.yaml', 'access.yaml', 'site.yaml']);

/** Files every code release must have: the loader and the page stylesheet. */
export const REQUIRED_FILES: readonly string[] = Object.freeze(['scripts/components.js', 'styles/styles.css']);

/** The folder of the engine's own files in a code release (the block kit). */
export const ENGINE_PREFIX = '_foliwake';

/** The engine's files that every code release holds under ENGINE_PREFIX (the previous kit only when named). */
export const ENGINE_RELEASE_FILES: readonly string[] = Object.freeze(['block-kit.js', 'lit-html.js', 'block-kit-1.js']);

/** Release-root files the engine generates from the site code; a site never writes them. */
export const GENERATED_FILES: readonly string[] = Object.freeze([
  'blocks.json',
  'templates.json',
  'shell.json',
  'blocks-catalog.json',
]);

const EXTENSIONS: ReadonlySet<string> = new Set(CODE_FILE_EXTENSIONS);

/** The file of a block's examples. */
export function exampleFileOf(block: string): string {
  return `components/${block}/${block}.example.md`;
}

/** Whether a code-root-relative posix path is a block example file (`components/<name>/<name>.example.md`). */
export function isExampleFile(relative: string): boolean {
  const match = /^components\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\.example\.md$/.exec(relative);
  return match !== null && match[1] === match[2];
}

/** Whether a path is under a code root, at any depth (captured or not). */
export function isUnderCodeRoot(relative: string): boolean {
  const segments = relative.split('/');
  return segments.length >= 2 && CODE_ROOTS.includes(segments[0]);
}

/** Whether a path has a hidden or empty segment (`.git`, `.DS_Store`, `a//b`). */
export function hasHiddenSegment(relative: string): boolean {
  return relative.split('/').some((segment) => segment === '' || segment.startsWith('.'));
}

/** True for paths that are release inputs under the code roots (relative to the site root, posix separators). */
export function isCodeInput(relative: string): boolean {
  if (!isUnderCodeRoot(relative) || hasHiddenSegment(relative)) return false;
  return EXTENSIONS.has(extensionOf(relative)) || isExampleFile(relative);
}

/** True for captured files: code inputs and the exact root files. */
export function isCapturedInput(relative: string): boolean {
  return CODE_ROOT_FILES.includes(relative) || isCodeInput(relative);
}

/** Whether a release path is one the engine generates or owns (never an input of the site). */
export function isGeneratedPath(relative: string): boolean {
  return GENERATED_FILES.includes(relative) || relative.startsWith(`${ENGINE_PREFIX}/`);
}

/**
 * Limits of site code: the size of one file, of the whole release, and the number of files. Over a limit is a
 * warning for now (CODE_FILE_TOO_LARGE, CODE_RELEASE_TOO_LARGE) and becomes an error in a later minor version.
 */
export const CODE_LIMITS = Object.freeze({ fileBytes: 2 * 1024 * 1024, releaseBytes: 30 * 1024 * 1024, files: 2000 });
