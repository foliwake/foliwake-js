// A working folder read the way the platform captures a commit: the regular files under the code roots and the
// root files by exact name. Hidden folders are not entered and symbolic links are not followed (a capture
// takes regular files only); both are listed as ignored, like files of other types under the code roots.
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { CODE_ROOTS, CODE_ROOT_FILES, ignoredReason, isCapturedInput, isLicenseFile } from './formats/layout.js';

/** A file under a code root that the platform never captures, and why. */
export interface IgnoredFile {
  file: string;
  reason: string;
}

/** What a folder holds under the code roots: the bytes of what a capture takes, and what it never takes. */
export interface FolderFiles {
  files: Map<string, Uint8Array>;
  ignored: IgnoredFile[];
}

/** Operating-system litter that is never committed (the starters' .gitignore lists it): not even noted. */
const LITTER: ReadonlySet<string> = new Set(['.DS_Store']);

export async function readFolder(root: string): Promise<FolderFiles> {
  const found: FolderFiles = { files: new Map(), ignored: [] };
  for (const folder of CODE_ROOTS) await walk(root, folder, found);
  for (const file of CODE_ROOT_FILES) {
    const stats = await lstat(path.join(root, file)).catch(() => null);
    if (stats?.isFile()) found.files.set(file, await readFile(path.join(root, file)));
  }
  return found;
}

async function walk(root: string, relative: string, found: FolderFiles): Promise<void> {
  const entries = await readdir(path.join(root, ...relative.split('/')), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (LITTER.has(entry.name)) continue;
    const child = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) found.ignored.push({ file: child, reason: 'a symbolic link is never captured' });
    else if (entry.isDirectory() && entry.name.startsWith('.')) {
      found.ignored.push({ file: `${child}/`, reason: 'a hidden folder is never captured' });
    } else if (entry.isDirectory()) await walk(root, child, found);
    else if (entry.isFile()) await addFile(root, child, found);
  }
}

// A captured file's bytes are read; any other file is only listed.
async function addFile(root: string, relative: string, found: FolderFiles): Promise<void> {
  if (isCapturedInput(relative)) found.files.set(relative, await readFile(path.join(root, ...relative.split('/'))));
  else if (!isLicenseFile(relative)) found.ignored.push({ file: relative, reason: ignoredReason(relative) });
}
