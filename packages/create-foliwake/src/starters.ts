// The starters shipped in this package: one source of the files of a new project, for `create-foliwake` and for
// the Foliwake engine (`foliwake create`, `blocks new --react`). Layers: shared/, then minimal/, then the
// template's own folder, then the options (storybook/, react/); a later layer replaces a file of an earlier
// one. npm drops dotfiles such as .gitignore from a package, so they are stored as `_gitignore`, `_github/` and
// `_storybook/`. The vendored React is built when this package is built (vendor/, not committed).
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The package root (dist/ → ..). */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STARTERS_ROOT = path.join(PACKAGE_ROOT, 'starters');
/** The vendored React of this package's build, and where a project gets it. */
export const VENDOR_ROOT = path.join(PACKAGE_ROOT, 'vendor');
export const VENDOR_REACT_FILES: Readonly<Record<string, string>> = Object.freeze({
  'react.js': 'scripts/vendor/react.js',
  'react.LICENSE.txt': 'scripts/vendor/react.LICENSE.txt',
});

export const LAYERS = ['shared', 'minimal', 'examples', 'storybook', 'react'] as const;
export type Layer = (typeof LAYERS)[number];

const RENAMED: Readonly<Record<string, string>> = {
  _gitignore: '.gitignore',
  _github: '.github',
  _storybook: '.storybook',
};

/** The path a starter file has in a project (`_github/…` → `.github/…`). */
export function projectPath(starterPath: string): string {
  const [first, ...rest] = starterPath.split('/');
  return [RENAMED[first] ?? first, ...rest].join('/');
}

/** The files of one layer, as starter paths (posix, relative to the layer). */
export async function layerFiles(layer: Layer): Promise<string[]> {
  const root = path.join(STARTERS_ROOT, layer);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  return files.map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

/** The bytes of one starter file, e.g. `starterFile('react', 'scripts/react-view.js')`. */
export function starterFile(layer: Layer, starterPath: string): Promise<Buffer> {
  return readFile(path.join(STARTERS_ROOT, layer, ...starterPath.split('/')));
}

/** The vendored React files as project paths and bytes; throws when this package was built without them. */
export async function vendoredReact(): Promise<Array<[string, Buffer]>> {
  const files: Array<[string, Buffer]> = [];
  for (const [built, project] of Object.entries(VENDOR_REACT_FILES)) {
    const file = path.join(VENDOR_ROOT, built);
    const bytes = await readFile(file).catch((error: NodeJS.ErrnoException) => {
      throw new Error(`The vendored React of create-foliwake is missing (${file}: ${error.code ?? error.message}).`);
    });
    files.push([project, bytes]);
  }
  return files;
}

/** The version of the @foliwake/site-check this package depends on (the projects pin it). */
export async function siteCheckVersion(): Promise<string> {
  const manifest = new URL(import.meta.resolve('@foliwake/site-check/package.json'));
  return (JSON.parse(await readFile(manifest, 'utf8')) as { version: string }).version;
}

/** This package's version. */
export async function packageVersion(): Promise<string> {
  const manifest = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version?: unknown };
  return typeof manifest.version === 'string' ? manifest.version : 'unknown';
}
