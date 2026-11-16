// The JSON Schema of block definitions for editors: `.foliwake/schemas/block-1.schema.json` in the project,
// named by the `$schema` of each `components/<name>/<name>.json`. Git-ignored, never committed; `foliwake dev`
// refreshes it. Written from @foliwake/site-check, so it is the checker's own rule set.
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BLOCK_SCHEMA_FILE, blockSchemaText } from '@foliwake/site-check/blocks/schema';

export const LOCAL_SCHEMA_PATH = `.foliwake/schemas/${BLOCK_SCHEMA_FILE}`;

/** Writes (or refreshes) the schema; never through a symbolic link. Returns its project path. */
export async function writeLocalSchema(projectRoot: string): Promise<string> {
  const parts = LOCAL_SCHEMA_PATH.split('/');
  for (let depth = 1; depth <= parts.length; depth++) {
    const info = await lstat(path.join(projectRoot, ...parts.slice(0, depth))).catch(() => null);
    if (info?.isSymbolicLink())
      throw new Error(`${parts.slice(0, depth).join('/')} is a symbolic link; nothing is written through links`);
  }
  const target = path.join(projectRoot, ...parts);
  const text = blockSchemaText();
  if ((await readFile(target, 'utf8').catch(() => null)) === text) return LOCAL_SCHEMA_PATH;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
  return LOCAL_SCHEMA_PATH;
}
