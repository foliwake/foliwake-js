// The conservative next.config edit: wrap the default export in withFoliwake() for two ESM forms only,
// `export default <name>;` and `export default { … };`. Anything else (CommonJS, a function, an already wrapped
// call) is left alone and init prints the three lines to add by hand.

const IMPORT = "import { withFoliwake } from '@foliwake/next/config';";
const BY_NAME = /^export default ([A-Za-z_$][\w$]*);?[ \t]*$/m;
const OBJECT_START = /^export default \{/m;

/** What init does with next.config. */
export type ConfigEdit = { kind: 'wrapped'; text: string } | { kind: 'present' } | { kind: 'manual'; reason: string };

/** The lines a person adds when the file is not one of the two forms. */
export const MANUAL_STEPS = [
  IMPORT,
  'Wrap the exported config: export default withFoliwake(yourConfig);',
  'Keep cacheComponents: true in it (the page route needs it).',
];

function withImport(text: string): string {
  const imports = [...text.matchAll(/^import .*;[ \t]*$/gm)];
  const last = imports.at(-1);
  if (!last) return `${IMPORT}\n${text}`;
  const end = last.index! + last[0].length;
  return `${text.slice(0, end)}\n${IMPORT}${text.slice(end)}`;
}

function wrapByName(text: string, match: RegExpExecArray): string {
  return text.replace(match[0], `export default withFoliwake(${match[1]});`);
}

// `export default {` … the last `}` of the file, followed only by `;` and whitespace.
function wrapObject(text: string, start: number): string | null {
  const end = text.lastIndexOf('}');
  if (end < start || !/^;?\s*$/.test(text.slice(end + 1))) return null;
  const object = text.slice(start + 'export default '.length, end + 1);
  return `${text.slice(0, start)}export default withFoliwake(${object});\n`;
}

/** The edit of a next.config text (an ES module). */
export function editNextConfig(text: string, file: string): ConfigEdit {
  if (text.includes('withFoliwake')) return { kind: 'present' };
  if (file.endsWith('.cjs') || /\bmodule\.exports\s*=/.test(text)) {
    return { kind: 'manual', reason: 'CommonJS: @foliwake/next is an ES module; use next.config.mjs or .ts' };
  }
  const byName = BY_NAME.exec(text);
  if (byName) return { kind: 'wrapped', text: withImport(wrapByName(text, byName)) };
  const object = OBJECT_START.exec(text);
  const wrapped = object ? wrapObject(text, object.index) : null;
  if (wrapped !== null) return { kind: 'wrapped', text: withImport(wrapped) };
  return { kind: 'manual', reason: 'the default export is not a name or an object literal' };
}

/** Whether the config text turns on cacheComponents (a hint only: init never turns it on silently). */
export function hasCacheComponents(text: string): boolean {
  return /cacheComponents\s*:\s*true/.test(text);
}
