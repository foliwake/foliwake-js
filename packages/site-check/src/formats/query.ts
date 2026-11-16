// Query index configuration: `query.yaml` at the root of the site code, captured into the code release and
// checked when the release is prepared. Schema `foliwake-query/1`:
//
//   version: 1
//   indices:
//     <name>: { include: [<glob>…], exclude: [<glob>…], target: /<…>.json, properties: [<built-in>…] }
//   sitemap: { source: <index name> }
//
// Unknown keys are refused at every level; the YAML subset is the strict one of yaml.ts (no tags, anchors,
// aliases, merge keys or duplicate keys). Pure: no store, no clock, no environment.
//
// Glob grammar (bounded): `/`-separated segments; a segment is `**` (zero or more whole segments) or a run of
// `[a-z0-9_-]` literals and `*` (any characters within one segment). No braces, classes, negation or escapes.
// Matching is segment by segment with memoisation: O(pattern segments × path segments) segment comparisons,
// each linear in the segment lengths.
import { PAGE_FIELD_NAME_MAX_LENGTH, PAGE_FIELD_NAME_PATTERN, RESERVED_PREFIXES } from './constants.js';
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

/** The release-root file name. */
export const QUERY_FILE = 'query.yaml';
export const QUERY_SCHEMA = 'foliwake-query/1';

/** Built-in row properties; `path` is always the first column and never declared. */
export const QUERY_PROPERTIES = ['id', 'title', 'description', 'lang'] as const;
export type QueryProperty = (typeof QUERY_PROPERTIES)[number];

// Front matter keys that are neither built-in properties nor page fields: an index cannot list them.
const NOT_PROPERTIES: readonly string[] = ['path', 'template', 'authoring'];

/** Whether `property` is a built-in property; any other declared property reads the page field of that name. */
export function isBuiltInProperty(property: string): property is QueryProperty {
  const builtIn: readonly string[] = QUERY_PROPERTIES;
  return builtIn.includes(property);
}

export const QUERY_LIMITS = Object.freeze({
  fileBytes: 64 * 1024,
  indexes: 10,
  properties: 10,
  globsPerList: 20,
  globLength: 200,
  targetLength: 200,
  nameLength: 64,
});

export interface QueryIndexConfig {
  name: string;
  include: string[];
  exclude: string[];
  target: string;
  /** Built-in properties (QUERY_PROPERTIES) and page field names, in declared order. */
  properties: string[];
}

/** A validated `query.yaml` (indices in declared order). */
export interface QueryConfig {
  schema: typeof QUERY_SCHEMA;
  indices: QueryIndexConfig[];
  sitemap: { source: string } | null;
}

export type QueryConfigResult =
  { config: QueryConfig; problems?: undefined } | { config?: undefined; problems: FileProblem[] };

const INDEX_NAME = /^[a-z][a-z0-9-]*$/;
const INDEX_NAME_RULE = `must match [a-z][a-z0-9-]* (at most ${QUERY_LIMITS.nameLength} characters)`;
// A target segment: lower-case letters, digits, `-`, `_` and `.`, not starting with a dot (so never
// `.`, `..` or a dotfile); the last ends in `.json`. Upper case is refused: page paths are lower case.
const TARGET_SEGMENT = /^[a-z0-9_-][a-z0-9._-]*$/;
const TARGET_SEGMENT_RULE =
  'must be a normalised path: lower-case segments of a-z, 0-9, -, _ and . ' +
  'that do not start with a dot (no empty, . or .. segments)';
const GLOB_SEGMENT = /^[a-z0-9_*-]+$/;
const ROOT_KEYS = new Set(['version', 'indices', 'sitemap']);
const INDEX_KEYS = new Set(['include', 'exclude', 'target', 'properties']);
const SITEMAP_KEYS = new Set(['source']);

/** Parses and checks the bytes of `query.yaml`. Every problem is reported; a config only when there is none. */
export function parseQueryConfig(bytes: Uint8Array): QueryConfigResult {
  if (bytes.byteLength > QUERY_LIMITS.fileBytes) {
    const limit = QUERY_LIMITS.fileBytes;
    return { problems: [fileProblem(`the file has ${bytes.byteLength} bytes; at most ${limit} are allowed`)] };
  }
  const text = decodeUtf8(bytes);
  if (text === null) return { problems: [fileProblem('the file is not valid UTF-8')] };
  const parsed: ParsedYaml = parseYaml(text, { line: 1, column: 1 });
  if (parsed.issues.length > 0) return { problems: yamlProblems(parsed) };
  const problems: FileProblem[] = [];
  const at: Report = problemRecorder(parsed, problems);

  const root = parsed.contents;
  if (!isMap(root)) {
    at(root, '', `the file must be a mapping with \`version: 1\` and \`indices\`, found ${describeNode(root)}`);
    return { problems };
  }
  const rootFields = fieldsOf(root, '', ROOT_KEYS, at);
  const version = rootFields.get('version');
  if (!version) at(root, 'version', '`version` is required (`version: 1`)');
  else if (!isScalar(version.value) || version.value.value !== 1)
    at(version.value ?? version.key, 'version', `\`version\` must be 1, found ${describeNode(version.value)}`);

  const indices: QueryIndexConfig[] = [];
  const indicesField = rootFields.get('indices');
  if (!indicesField) at(root, 'indices', '`indices` is required: a mapping of index names to their definitions');
  else if (!isMap(indicesField.value) || indicesField.value.items.length === 0) {
    const found = indicesField.value;
    at(
      indicesField.value ?? indicesField.key,
      'indices',
      `\`indices\` must be a non-empty mapping of index names to definitions, found ${describeNode(found)}`,
    );
  } else {
    if (indicesField.value.items.length > QUERY_LIMITS.indexes)
      at(
        indicesField.value,
        'indices',
        `${indicesField.value.items.length} indexes are declared; at most ${QUERY_LIMITS.indexes} are allowed`,
      );
    const targets = new Map<string, string>();
    for (const pair of indicesField.value.items) {
      if (!isPair(pair)) continue;
      const name = isScalar(pair.key) ? pair.key.value : undefined;
      if (typeof name !== 'string' || !INDEX_NAME.test(name) || name.length > QUERY_LIMITS.nameLength) {
        at(pair.key, 'indices', `index name ${JSON.stringify(name ?? null)} ${INDEX_NAME_RULE}`);
        continue;
      }
      const field = `indices.${name}`;
      const index = readIndex(pair.value, pair.key, field, at);
      if (!index) continue;
      const owner = targets.get(index.target);
      if (owner !== undefined) {
        at(
          pair.value,
          `${field}.target`,
          `target ${index.target} is already the target of index "${owner}"; targets must be unique`,
        );
        continue;
      }
      targets.set(index.target, name);
      indices.push({ name, ...index });
    }
  }

  let sitemap: QueryConfig['sitemap'] = null;
  const sitemapField = rootFields.get('sitemap');
  if (sitemapField) {
    if (!isMap(sitemapField.value))
      at(
        sitemapField.value ?? sitemapField.key,
        'sitemap',
        `\`sitemap\` must be a mapping with \`source\`, found ${describeNode(sitemapField.value)}`,
      );
    else {
      const fields = fieldsOf(sitemapField.value, 'sitemap', SITEMAP_KEYS, at);
      const source = fields.get('source');
      if (!source)
        at(
          sitemapField.value,
          'sitemap.source',
          '`sitemap.source` is required: the name of the index the sitemap lists',
        );
      else {
        const name = isScalar(source.value) ? source.value.value : undefined;
        const declared =
          indices.some((index) => index.name === name) ||
          (isMap(indicesField?.value) &&
            indicesField.value.items.some((p) => isPair(p) && isScalar(p.key) && p.key.value === name));
        if (typeof name !== 'string')
          at(
            source.value ?? source.key,
            'sitemap.source',
            `\`sitemap.source\` must be an index name, found ${describeNode(source.value)}`,
          );
        else if (!declared)
          at(
            source.value,
            'sitemap.source',
            `\`sitemap.source\` names index "${name}", which is not declared in \`indices\``,
          );
        else sitemap = { source: name };
      }
    }
  }

  if (problems.length > 0) return { problems };
  return { config: { schema: QUERY_SCHEMA, indices, sitemap } };
}

type Report = (node: unknown, field: string | null, message: string) => void;
interface Field {
  key: unknown;
  value: unknown;
}

// The fields of a mapping by key; unknown and non-string keys are reported.
function fieldsOf(
  map: { items: unknown[] },
  prefix: string,
  known: ReadonlySet<string>,
  at: Report,
): Map<string, Field> {
  const fields = new Map<string, Field>();
  for (const pair of map.items) {
    if (!isPair(pair)) continue;
    const key = isScalar(pair.key) ? pair.key.value : undefined;
    const name = typeof key === 'string' ? key : null;
    if (name === null || !known.has(name)) {
      at(
        pair.key,
        prefix,
        `unknown key ${JSON.stringify(name ?? describeNode(pair.key))}; allowed: ${[...known].join(', ')}`,
      );
      continue;
    }
    fields.set(name, { key: pair.key, value: pair.value });
  }
  return fields;
}

function readIndex(node: unknown, keyNode: unknown, field: string, at: Report): Omit<QueryIndexConfig, 'name'> | null {
  if (!isMap(node)) {
    at(
      node ?? keyNode,
      field,
      `an index must be a mapping with include, target and properties, found ${describeNode(node)}`,
    );
    return null;
  }
  let reported = 0;
  const counted: Report = (n, f, m) => {
    reported++;
    at(n, f, m);
  };
  const fields = fieldsOf(node, field, INDEX_KEYS, counted);
  const include = readGlobs(fields.get('include'), node, `${field}.include`, true, counted);
  const exclude = readGlobs(fields.get('exclude'), node, `${field}.exclude`, false, counted);
  const target = readTarget(fields.get('target'), node, `${field}.target`, counted);
  const properties = readProperties(fields.get('properties'), node, `${field}.properties`, counted);
  if (reported > 0 || include === null || exclude === null || target === null || properties === null) return null;
  return { include, exclude, target, properties };
}

function readGlobs(
  found: Field | undefined,
  owner: unknown,
  field: string,
  required: boolean,
  at: Report,
): string[] | null {
  if (!found) {
    if (required) {
      at(owner, field, `\`${lastSegment(field)}\` is required: a non-empty list of path globs such as "/**"`);
      return null;
    }
    return [];
  }
  if (!isSeq(found.value) || found.value.items.length === 0) {
    at(
      found.value ?? found.key,
      field,
      `\`${lastSegment(field)}\` must be a non-empty list of path globs, found ${describeNode(found.value)}`,
    );
    return null;
  }
  if (found.value.items.length > QUERY_LIMITS.globsPerList) {
    at(
      found.value,
      field,
      `${found.value.items.length} globs are listed; at most ${QUERY_LIMITS.globsPerList} are allowed`,
    );
    return null;
  }
  const globs: string[] = [];
  let ok = true;
  found.value.items.forEach((item, i) => {
    const value = isScalar(item) ? item.value : undefined;
    const problem = typeof value === 'string' ? globProblem(value) : `must be a string, found ${describeNode(item)}`;
    if (problem !== null || typeof value !== 'string') {
      at(
        item,
        `${field}[${i}]`,
        `glob ${typeof value === 'string' ? JSON.stringify(value) : ''} ${problem}`.replace(/\s+/g, ' '),
      );
      ok = false;
    } else globs.push(value);
  });
  return ok ? globs : null;
}

function readTarget(found: Field | undefined, owner: unknown, field: string, at: Report): string | null {
  if (!found) {
    at(owner, field, '`target` is required: the absolute path the index is served at, ending in .json');
    return null;
  }
  const value = isScalar(found.value) ? found.value.value : undefined;
  if (typeof value !== 'string') {
    at(found.value ?? found.key, field, `\`target\` must be a path, found ${describeNode(found.value)}`);
    return null;
  }
  const problem = targetProblem(value);
  if (problem !== null) {
    at(found.value, field, `target ${JSON.stringify(value)} ${problem}`);
    return null;
  }
  return value;
}

// A declared property: a built-in property or the name of a page field.
const isPropertyName = (name: string): boolean =>
  name.length <= PAGE_FIELD_NAME_MAX_LENGTH && PAGE_FIELD_NAME_PATTERN.test(name);
const PROPERTY_RULE =
  `use a built-in property (${QUERY_PROPERTIES.join(', ')}) or a page field name ` +
  `(a lower-case letter, then lower-case letters, digits and _, at most ${PAGE_FIELD_NAME_MAX_LENGTH} characters)`;

function readProperties(found: Field | undefined, owner: unknown, field: string, at: Report): string[] | null {
  if (!found) {
    const kinds = `built-in properties (${QUERY_PROPERTIES.join(', ')}) and page field names`;
    at(owner, field, `\`properties\` is required: a list of ${kinds}; \`path\` is always included`);
    return null;
  }
  if (!isSeq(found.value)) {
    at(found.value ?? found.key, field, `\`properties\` must be a list, found ${describeNode(found.value)}`);
    return null;
  }
  if (found.value.items.length > QUERY_LIMITS.properties) {
    at(
      found.value,
      field,
      `${found.value.items.length} properties are listed; at most ${QUERY_LIMITS.properties} are allowed`,
    );
    return null;
  }
  const properties: string[] = [];
  let ok = true;
  found.value.items.forEach((item, i) => {
    const value = isScalar(item) ? item.value : undefined;
    if (value === 'path') {
      at(item, `${field}[${i}]`, '`path` is always the first column; do not declare it');
      ok = false;
    } else if (typeof value !== 'string' || !isPropertyName(value)) {
      const name = JSON.stringify(typeof value === 'string' ? value : describeNode(item));
      at(item, `${field}[${i}]`, `property ${name} is not a property name; ${PROPERTY_RULE}`);
      ok = false;
    } else if (NOT_PROPERTIES.includes(value)) {
      at(item, `${field}[${i}]`, `"${value}" is a front matter key the index cannot list; ${PROPERTY_RULE}`);
      ok = false;
    } else if (properties.includes(value)) {
      at(item, `${field}[${i}]`, `property "${value}" is listed twice`);
      ok = false;
    } else properties.push(value);
  });
  return ok ? properties : null;
}

const lastSegment = (field: string): string => field.slice(field.lastIndexOf('.') + 1);

/** Why `target` is not an allowed index target (null: it is). */
export function targetProblem(target: string): string | null {
  if (target.length > QUERY_LIMITS.targetLength) return `is longer than ${QUERY_LIMITS.targetLength} characters`;
  if (!target.startsWith('/')) return 'must be an absolute path (start with /)';
  const segments = target.slice(1).split('/');
  if (segments.some((s) => !TARGET_SEGMENT.test(s))) return TARGET_SEGMENT_RULE;
  if (!target.endsWith('.json')) return 'must end in .json';
  if (target === '/sitemap.xml') return 'is reserved for the sitemap';
  const prefix = RESERVED_PREFIXES.find((p) => target === p || target.startsWith(`${p}/`));
  if (prefix) return `is under the reserved prefix ${prefix}/`;
  return null;
}

/** Why `glob` is not a valid bounded glob (null: it is). */
export function globProblem(glob: string): string | null {
  if (glob.length > QUERY_LIMITS.globLength) return `is longer than ${QUERY_LIMITS.globLength} characters`;
  if (!glob.startsWith('/')) return 'must start with /';
  if (glob === '/') return null;
  const segments = glob.slice(1).split('/');
  for (const segment of segments) {
    if (segment === '') return 'has an empty segment (// or a trailing /)';
    if (segment === '**') continue;
    if (!GLOB_SEGMENT.test(segment))
      return 'may only use a-z, 0-9, -, _, * (within a segment) and ** (a whole segment)';
    if (segment.includes('**')) return 'uses ** inside a segment; ** must be a whole segment';
  }
  return null;
}

/** A compiled glob: one entry per segment (`**`, or the literal parts around each `*`). */
export type CompiledGlob = ReadonlyArray<'**' | readonly string[]>;

/** Compiles a glob that passed globProblem. */
export function compileGlob(glob: string): CompiledGlob {
  if (glob === '/') return [];
  return glob
    .slice(1)
    .split('/')
    .map((segment) => (segment === '**' ? '**' : segment.split('*')));
}

/**
 * Where the literal parts of one segment pattern lie in `segment`: the offset of each part, or null
 * when the segment does not match. The parts are separated by placeholders of at least `minGap`
 * characters (`*` of an index glob: 0; a capture of a source path mapping: 1). The first part is
 * anchored at the start, the last at the end, the ones between are searched left to right (each at
 * its leftmost fit): linear-time for a fixed number of parts.
 */
export function segmentSplit(parts: readonly string[], segment: string, minGap = 0): number[] | null {
  if (parts.length === 1) return parts[0] === segment ? [0] : null;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const gaps = (parts.length - 1) * minGap;
  if (!segment.startsWith(first) || segment.length < first.length + last.length + gaps || !segment.endsWith(last))
    return null;
  const offsets = [0];
  let at = first.length;
  const end = segment.length - last.length;
  for (let i = 1; i < parts.length - 1; i++) {
    const found = segment.indexOf(parts[i], at + minGap);
    if (found === -1 || found + parts[i].length + minGap > end) return null;
    offsets.push(found);
    at = found + parts[i].length;
  }
  offsets.push(end);
  return offsets;
}

/**
 * Whether the page path matches the compiled glob (`/x/**` also matches
 * `/x`; `/**` matches every path, `/` included). Memoised over (pattern
 * segment, path segment) positions.
 */
export function globMatches(glob: CompiledGlob, pagePath: string): boolean {
  const segments = pagePath === '/' ? [] : pagePath.slice(1).split('/');
  const p = glob.length;
  const s = segments.length;
  // reach[j] for the current pattern position i: whether pattern[i..] matches segments[j..].
  let next = new Array<boolean>(s + 1).fill(false);
  next[s] = true; // empty pattern matches empty rest
  for (let i = p - 1; i >= 0; i--) {
    const current = new Array<boolean>(s + 1).fill(false);
    const part = glob[i];
    if (part === '**') {
      // ** matches zero segments (next[j]) or one more (current[j + 1]).
      for (let j = s; j >= 0; j--) current[j] = next[j] || (j < s && current[j + 1]);
    } else {
      for (let j = 0; j < s; j++) current[j] = next[j + 1] && segmentSplit(part, segments[j]) !== null;
    }
    next = current;
  }
  return next[0];
}

/** Compiled include/exclude lists of one index: a page is in it when it matches an include and no exclude. */
export function indexFilter(index: Pick<QueryIndexConfig, 'include' | 'exclude'>): (pagePath: string) => boolean {
  const include = index.include.map(compileGlob);
  const exclude = index.exclude.map(compileGlob);
  return (pagePath) => include.some((g) => globMatches(g, pagePath)) && !exclude.some((g) => globMatches(g, pagePath));
}
