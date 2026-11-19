// The optional `blocks` key of components/components.json: which module of the code release an
// embedding app loads to enhance blocks, which blocks contract it implements and its event prefix.
// The same rule as the engine's code release validation (which also names the entry in the X-Foliwake-Blocks
// header of a `.plain.html` response). The path rule is the one of `app.blocks.entry` in foliwake.remote.json.

/** The validated `blocks` key of a component descriptor. */
export interface BlocksEntry {
  /** A `.js` file of the code release, such as `scripts/blocks.js`. */
  entry: string;
  /** The major version of the blocks contract the entry implements (`foliwake-blocks/<contract>`). */
  contract: number;
  /** The prefix of the DOM events the blocks emit (`<prefix>:<name>`). */
  eventPrefix: string;
}

const ENTRY_ROOTS = ['scripts', 'components', '_foliwake'];
const ENTRY_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const EVENT_PREFIX = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_CONTRACT = 999;
const KEYS = ['contract', 'entry', 'eventPrefix'];

export const BLOCKS_ENTRY_RULE =
  '"blocks" must be {"entry": "scripts/<file>.js", "contract": <major>, "eventPrefix": "<prefix>"}: ' +
  'the entry is 2–8 segments of [A-Za-z0-9_.-], the first one scripts, components or _foliwake, ending in .js; ' +
  'the contract a positive integer; the prefix [a-z][a-z0-9-], at most 32 characters.';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function isSafeSegment(segment: string): boolean {
  return ENTRY_SEGMENT.test(segment) && !segment.includes('..');
}

/** True for a release-relative module path an app may load as the blocks entry. */
export function isBlocksEntryPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.endsWith('.js')) return false;
  const segments = value.split('/');
  if (segments.length < 2 || segments.length > 8) return false;
  return ENTRY_ROOTS.includes(segments[0]!) && segments.every(isSafeSegment);
}

function isContract(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_CONTRACT;
}

function hasOnlyKnownKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) => KEYS.includes(key));
}

/** The `blocks` key when it is valid, otherwise null (callers report BLOCKS_ENTRY_RULE). */
export function parseBlocksEntry(value: unknown): BlocksEntry | null {
  if (!isPlainObject(value) || !hasOnlyKnownKeys(value)) return null;
  const { entry, contract, eventPrefix } = value;
  if (!isBlocksEntryPath(entry) || !isContract(contract)) return null;
  if (typeof eventPrefix !== 'string' || !EVENT_PREFIX.test(eventPrefix)) return null;
  return { entry, contract, eventPrefix };
}
