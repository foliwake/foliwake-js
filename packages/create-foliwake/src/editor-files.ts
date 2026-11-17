// Files for editors in a new project, git-ignored and never committed (`foliwake dev` refreshes them):
//  - `.foliwake/schemas/block-1.schema.json`, named by the `$schema` of each `components/<name>/<name>.json`,
//    written from @foliwake/site-check, so it is the checker's own rule set;
//  - `.foliwake/types/foliwake.d.ts`, the types of the module `@foliwake/block-kit` (jsconfig.json maps the
//    specifier there), from @foliwake/block-kit. The types of each block (`.foliwake/types/blocks/`) come from the CLI.
// Nothing is written through a symbolic link.
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BLOCK_SCHEMA_FILE, blockSchemaText } from '@foliwake/site-check/blocks/schema';

export const LOCAL_SCHEMA_PATH = `.foliwake/schemas/${BLOCK_SCHEMA_FILE}`;
export const KIT_TYPES_PATH = '.foliwake/types/foliwake.d.ts';

async function refuseLinks(projectRoot: string, relative: string): Promise<void> {
  const parts = relative.split('/');
  for (let depth = 1; depth <= parts.length; depth++) {
    const info = await lstat(path.join(projectRoot, ...parts.slice(0, depth))).catch(() => null);
    if (!info?.isSymbolicLink()) continue;
    throw new Error(`${parts.slice(0, depth).join('/')} is a symbolic link; nothing is written through links`);
  }
}

/** Writes `text` at `relative` unless it is there already; returns `relative`. */
async function writeEditorFile(projectRoot: string, relative: string, text: string): Promise<string> {
  await refuseLinks(projectRoot, relative);
  const target = path.join(projectRoot, ...relative.split('/'));
  if ((await readFile(target, 'utf8').catch(() => null)) === text) return relative;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
  return relative;
}

/** Writes (or refreshes) the JSON Schema of block definitions. */
export function writeLocalSchema(projectRoot: string): Promise<string> {
  return writeEditorFile(projectRoot, LOCAL_SCHEMA_PATH, blockSchemaText());
}

/** Writes (or refreshes) the types of the module `@foliwake/block-kit`. */
export async function writeKitTypes(projectRoot: string): Promise<string> {
  const declaration = new URL(import.meta.resolve('@foliwake/block-kit/foliwake.d.ts'));
  return writeEditorFile(projectRoot, KIT_TYPES_PATH, await readFile(declaration, 'utf8'));
}
