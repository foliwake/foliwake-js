// The conservative next.config edits, for two ESM forms only, `export default <name>;` and `export default { … };`
// (each also once wrapped in withFoliwake): wrap the default export in withFoliwake(), and turn on
// cacheComponents in the config object literal. Anything else (CommonJS, a function, a config built elsewhere) is
// left alone and init prints the lines to add by hand.

const IMPORT = "import { withFoliwake } from '@foliwake/next/config';";
const BY_NAME = /^export default ([A-Za-z_$][\w$]*);?[ \t]*$/m;
const OBJECT_START = /^export default \{/m;

/** What init does with next.config. */
export type ConfigEdit = { kind: 'wrapped'; text: string } | { kind: 'present' } | { kind: 'manual'; reason: string };

/** The lines a person adds when the file is not one of the two forms. */
export const MANUAL_STEPS = [
  IMPORT,
  'Wrap the exported config: export default withFoliwake(yourConfig);',
  'Turn on cacheComponents in it (the page route needs it): cacheComponents: true,',
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

/** Whether the config text turns on cacheComponents. */
export function hasCacheComponents(text: string): boolean {
  return /cacheComponents\s*:\s*true/.test(text);
}

/** The line init adds to the config object, and prints when it cannot. */
export const CACHE_COMPONENTS_LINE = 'cacheComponents: true,';

/** What init does with cacheComponents. */
export type CacheEdit = { kind: 'added'; text: string } | { kind: 'present' } | { kind: 'manual'; reason: string };

const DEFAULT_OBJECT = /^export default (?:withFoliwake\()?\{/m;
const DEFAULT_NAME = /^export default (?:withFoliwake\()?([A-Za-z_$][\w$]*)\)?;?[ \t]*$/m;

function escaped(name: string): string {
  return name.replace(/\$/g, '\\$');
}

/** Where the `{` of `const <name>[: Type] = {` is, or null. */
function declaredObjectBrace(text: string, name: string): number | null {
  const declaration = new RegExp(`^(?:const|let|var) ${escaped(name)}(?:\\s*:\\s*[\\w.]+)?\\s*=\\s*\\{`, 'm');
  const match = declaration.exec(text);
  return match ? match.index + match[0].length - 1 : null;
}

/** Where the `{` of the exported config object literal is, or null when the export is another form. */
function configObjectBrace(text: string): number | null {
  const object = DEFAULT_OBJECT.exec(text);
  if (object) return object.index + object[0].length - 1;
  const byName = DEFAULT_NAME.exec(text);
  return byName ? declaredObjectBrace(text, byName[1]!) : null;
}

/** The indentation of the first non-blank line after `at`, or two spaces. */
function indentAfter(text: string, at: number): string {
  const next = /\n([ \t]*)\S/.exec(text.slice(at));
  return next && next[1] ? next[1] : '  ';
}

// `{\n  a: 1,` gets a line of its own; `{}` becomes `{ cacheComponents: true }`; `{ a: 1 }` gets it first.
function insertAfterBrace(text: string, brace: number): string {
  const head = text.slice(0, brace + 1);
  const rest = text.slice(brace + 1);
  if (rest.startsWith('\n')) return `${head}\n${indentAfter(text, brace)}${CACHE_COMPONENTS_LINE}${rest}`;
  if (/^\s*\}/.test(rest)) return `${head} cacheComponents: true ${rest.trimStart()}`;
  return `${head} ${CACHE_COMPONENTS_LINE} ${rest.trimStart()}`;
}

/** The cacheComponents edit of a next.config text (an ES module). */
export function addCacheComponents(text: string): CacheEdit {
  if (hasCacheComponents(text)) return { kind: 'present' };
  if (/\bcacheComponents\b/.test(text)) return { kind: 'manual', reason: 'cacheComponents is set to another value' };
  const brace = configObjectBrace(text);
  if (brace === null) return { kind: 'manual', reason: 'the exported config is not an object literal init can find' };
  return { kind: 'added', text: insertAfterBrace(text, brace) };
}
