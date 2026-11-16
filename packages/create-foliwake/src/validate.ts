// create-foliwake: the new project is checked with @foliwake/site-check before anything is written, over the
// planned files as a capture of the project folder would see them, so a broken starter never reaches a user.
// Every diagnostic counts (warnings and notes too): a starter must be clean. Its pages are rendered by the
// engine's own tests.
import { checkCodeRelease, formatDiagnostic } from '@foliwake/site-check';
import { CODE_ROOT_FILES, isUnderCodeRoot } from '@foliwake/site-check/formats/layout';

import type { ProjectFile } from './files.js';

/** Every problem of the project's code, in the terminal form; empty when it is clean. */
export async function projectProblems(files: readonly ProjectFile[]): Promise<string[]> {
  const code = files.filter((file) => isUnderCodeRoot(file.path) || CODE_ROOT_FILES.includes(file.path));
  const result = await checkCodeRelease(new Map(code.map((file) => [file.path, file.bytes])));
  return result.diagnostics.map(formatDiagnostic);
}
