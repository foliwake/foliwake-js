// Access rules: `access.yaml` at the root of the site code, captured into the code release and checked when the
// release is prepared. It says which paths anyone may read; everything else needs a service token.
//
//   version: 1
//   allow: ["/ge/ru", "/about"]
//   deny: ["/lessons/**"]
//
// A path is open when it matches an allow and no deny; a deny always wins. No file means every path is closed.
// Globs follow query.ts, and may also contain `.` and `_`, so a rule can name `/sitemap.xml`.
// Pure: no store, no clock, no environment.
import {
  type FileProblem,
  type ParsedYaml,
  decodeUtf8,
  describeNode,
  fileProblem,
  isMap,
  isPair,
  isScalar,
  isSeq,
  parseYaml,
  problemRecorder,
  yamlProblems,
} from './yaml.js';
import { RESERVED_PREFIXES } from './constants.js';
import { type CompiledGlob, compileGlob, globMatches } from './query.js';

/** The release-root file name. */
export const ACCESS_FILE = 'access.yaml';

export const ACCESS_LIMITS = Object.freeze({ fileBytes: 64 * 1024, globsPerList: 200, globLength: 200 });

/** Validated rules, compiled for matching. */
export interface AccessConfig {
  allow: CompiledGlob[];
  deny: CompiledGlob[];
}

export type AccessConfigResult =
  { config: AccessConfig; problems?: undefined } | { config?: undefined; problems: FileProblem[] };

const ROOT_KEYS = new Set(['version', 'allow', 'deny']);
const GLOB_SEGMENT = /^[a-z0-9_*-][a-z0-9._*-]*$/;

/** Why `glob` is not a valid rule (null: it is). */
export function accessGlobProblem(glob: string): string | null {
  if (glob.length > ACCESS_LIMITS.globLength) return `is longer than ${ACCESS_LIMITS.globLength} characters`;
  if (!glob.startsWith('/')) return 'must start with /';
  if (glob === '/') return null;
  const segments = glob.slice(1).split('/');
  for (const segment of segments) {
    if (segment === '') return 'has an empty segment (// or a trailing /)';
    if (segment === '**') continue;
    if (!GLOB_SEGMENT.test(segment))
      return 'may only use a-z, 0-9, -, _, . (not first), * (within a segment) and ** (a whole segment)';
    if (segment.includes('**')) return 'uses ** inside a segment; ** must be a whole segment';
  }
  const prefix = RESERVED_PREFIXES.find((p) => glob === p || glob.startsWith(`${p}/`));
  if (prefix) return `is under the reserved prefix ${prefix}/, whose committed files are always public`;
  return null;
}

/** Parses and checks the bytes of `access.yaml`. Every problem is reported; a config only when there is none. */
export function parseAccessConfig(bytes: Uint8Array): AccessConfigResult {
  if (bytes.byteLength > ACCESS_LIMITS.fileBytes) {
    return { problems: [fileProblem(`the file has ${bytes.byteLength} bytes; at most ${ACCESS_LIMITS.fileBytes}`)] };
  }
  const text = decodeUtf8(bytes);
  if (text === null) return { problems: [fileProblem('the file is not valid UTF-8')] };
  const parsed: ParsedYaml = parseYaml(text, { line: 1, column: 1 });
  if (parsed.issues.length > 0) return { problems: yamlProblems(parsed) };
  const problems: FileProblem[] = [];
  const at = problemRecorder(parsed, problems);
  const root = parsed.contents;
  if (!isMap(root)) {
    at(root, null, `the file must be a mapping with \`version: 1\`, found ${describeNode(root)}`);
    return { problems };
  }
  let version: unknown;
  const lists: Record<'allow' | 'deny', CompiledGlob[]> = { allow: [], deny: [] };
  for (const pair of root.items) {
    if (!isPair(pair)) continue;
    const key = isScalar(pair.key) ? pair.key.value : undefined;
    if (typeof key !== 'string' || !ROOT_KEYS.has(key)) {
      at(pair.key, null, `unknown key ${JSON.stringify(key ?? null)}; allowed: ${[...ROOT_KEYS].join(', ')}`);
    } else if (key === 'version') {
      version = isScalar(pair.value) ? pair.value.value : undefined;
    } else if (key === 'allow' || key === 'deny') {
      if (!isSeq(pair.value)) {
        at(pair.value ?? pair.key, key, `must be a list of paths, found ${describeNode(pair.value)}`);
        continue;
      }
      if (pair.value.items.length > ACCESS_LIMITS.globsPerList)
        at(pair.value, key, `has more than ${ACCESS_LIMITS.globsPerList} entries`);
      for (const item of pair.value.items) {
        const glob = isScalar(item) ? item.value : undefined;
        const problem = typeof glob === 'string' ? accessGlobProblem(glob) : 'must be a string';
        if (problem) at(item, key, `${JSON.stringify(glob ?? null)} ${problem}`);
        else lists[key].push(compileGlob(glob as string));
      }
    }
  }
  if (version !== 1) at(root, 'version', '`version: 1` is required');
  return problems.length > 0 ? { problems } : { config: lists };
}

/** Whether anyone may read the path. `config` null means no rules: every path is closed. */
export function isOpenPath(config: AccessConfig | null, path: string): boolean {
  if (!config) return false;
  return config.allow.some((glob) => globMatches(glob, path)) && !config.deny.some((glob) => globMatches(glob, path));
}
