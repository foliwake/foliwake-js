// The files the dev server serves under /_foliwake/: the block kit and lit-html from the installed
// @foliwake/block-kit (the same files every code release gets), and the block definition schema of
// @foliwake/site-check for editors.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BLOCK_SCHEMA_FILE, blockSchemaText } from '@foliwake/site-check/blocks/schema';

export const KIT_PREFIX = '_foliwake';

const JS = 'text/javascript; charset=utf-8';

/** File name under /_foliwake/ → its content type. */
export const KIT_FILES: Readonly<Record<string, string>> = Object.freeze({
  'block-kit.js': JS,
  'lit-html.js': JS,
  [BLOCK_SCHEMA_FILE]: 'application/schema+json',
});

/** Whether decoded request segments name a kit file (`/_foliwake/<file>`). */
export function isKitFile(segments: readonly string[]): boolean {
  return segments.length === 2 && segments[0] === KIT_PREFIX && Object.hasOwn(KIT_FILES, segments[1]);
}

function packageFile(name: string): Buffer {
  return readFileSync(fileURLToPath(import.meta.resolve(`@foliwake/block-kit/${name}`)));
}

const cache = new Map<string, Buffer>();

/** The bytes of a kit file, read once. */
export function kitFileBytes(name: string): Buffer {
  if (!Object.hasOwn(KIT_FILES, name)) throw new Error(`not a kit file: ${name}`);
  let bytes = cache.get(name);
  if (!bytes) {
    bytes = name === BLOCK_SCHEMA_FILE ? Buffer.from(blockSchemaText()) : packageFile(name);
    cache.set(name, bytes);
  }
  return bytes;
}
