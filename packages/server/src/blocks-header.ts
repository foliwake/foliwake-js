// `X-Foliwake-Blocks` of a `.plain.html` answer: the blocks module the page's code release names in its
// components/components.json, as an RFC 8941 dictionary: `entry="scripts/blocks.js", contract=2, prefix="demo"`.
// It belongs to the code release (like X-Code-Release), so it is cached with the body and never disagrees with it.
// Members this package does not know are ignored; a known member with a bad value refuses the answer.
import type { ReleaseBlocks } from '@foliwake/blocks-contract/page';
import { ENTRY_SEGMENT, ENTRY_ROOTS, EVENT_PREFIX } from './config-parts.js';
import { FoliwakePageError } from './errors.js';

/** The response header that names the blocks module of a page's code release. */
export const BLOCKS_HEADER = 'x-foliwake-blocks';

const MEMBER = /^\s*([a-z*][a-z0-9_.*-]*)=("(?:[^"\\]|\\.)*"|-?\d{1,15})\s*$/;
const MAX_LENGTH = 512;

function invalid(): FoliwakePageError {
  return new FoliwakePageError('invalid', 'The origin answered an invalid X-Foliwake-Blocks.');
}

function membersOf(value: string): Map<string, string | number> {
  const members = new Map<string, string | number>();
  for (const part of value.split(',')) {
    const match = MEMBER.exec(part);
    if (!match) throw invalid();
    const raw = match[2]!;
    members.set(match[1]!, raw.startsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : Number(raw));
  }
  return members;
}

function isEntry(value: unknown): value is string {
  if (typeof value !== 'string' || !value.endsWith('.js')) return false;
  const segments = value.split('/');
  if (segments.length < 2 || segments.length > 8 || !ENTRY_ROOTS.includes(segments[0]!)) return false;
  return segments.every((s) => ENTRY_SEGMENT.test(s) && !s.includes('..'));
}

function isContract(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 999;
}

/** The parsed header; null when the answer has none (the release names no blocks module). */
export function parseBlocksHeader(value: string | null): ReleaseBlocks | null {
  if (value === null) return null;
  if (value.length > MAX_LENGTH) throw invalid();
  const members = membersOf(value);
  const entry = members.get('entry');
  const contract = members.get('contract');
  const eventPrefix = members.get('prefix');
  if (!isEntry(entry) || !isContract(contract)) throw invalid();
  if (typeof eventPrefix !== 'string' || !EVENT_PREFIX.test(eventPrefix)) throw invalid();
  return { entry, contract, eventPrefix };
}
