// Strict YAML for the site files (site.yaml, query.yaml, access.yaml) and for front matter.
//
// The text is parsed with `yaml` 1.2, core schema, `uniqueKeys: true` and no
// custom tags. Before any value is used, two walks reject what the contract
// does not allow:
//   - a CST walk finds tags, anchors, aliases, directives and extra documents
//     (it has the exact source offset of each token);
//   - an AST walk finds duplicate keys (with the field path of the second key)
//     and merge keys (`<<`).
// Values are never converted with `toJS`; validators read the AST nodes.

import {
  LineCounter,
  Parser,
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  parseAllDocuments,
  type ParsedNode,
} from 'yaml';

/** A 1-based file position. */
export interface SourcePosition {
  line: number;
  column: number;
}

/** A problem of a YAML site file (site.yaml, query.yaml, access.yaml), at a file position. */
export interface FileProblem {
  line: number;
  column: number;
  /** the YAML field path (`indices.lessons.target`), or null for the file as a whole */
  field: string | null;
  message: string;
}

/** A YAML problem found before validation, at a file position. */
export interface YamlIssue {
  code: string;
  field: string | null;
  message: string;
  fix: string;
  line: number;
  column: number;
}

// The same problem while the walks run: an offset in the YAML text.
interface RawYamlIssue {
  code: string;
  offset: number;
  field: string | null;
  message: string;
  fix: string;
}

/** Result of parseYaml. */
export interface ParsedYaml {
  contents: ParsedNode | null;
  issues: YamlIssue[];
  position: (offset: number) => SourcePosition;
  sourceOf: (node: unknown) => string;
}

export const YAML_OPTIONS = Object.freeze({
  version: '1.2',
  schema: 'core',
  uniqueKeys: true,
  merge: false,
  prettyErrors: false,
  strict: true,
} as const);

const UNSUPPORTED_TOKENS: Readonly<Record<string, (source: unknown) => { message: string; fix: string }>> = {
  tag: (source) => ({
    message: `YAML tags such as "${source}" are not supported.`,
    fix: 'Remove the tag; write the value as plain text, quoted if needed.',
  }),
  anchor: (source) => ({
    message: `YAML anchors such as "${source}" are not supported.`,
    fix: 'Remove the anchor and write the value out in full.',
  }),
  alias: (source) => ({
    message: `YAML aliases such as "${source}" are not supported.`,
    fix: 'Write the value out in full instead of referring to an anchor.',
  }),
  directive: (source) => ({
    message: `YAML directives such as "${source}" are not supported.`,
    fix: 'Remove the directive line.',
  }),
};

function collectCstIssues(text: string): RawYamlIssue[] {
  const issues: RawYamlIssue[] = [];
  let documents = 0;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      const items: readonly unknown[] = value;
      for (const item of items) walk(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const token = value as Record<string, unknown>; // a CST token: a non-null object (checked above)
    if (token.type === 'document') {
      documents += 1;
      if (documents === 2) {
        issues.push({
          code: 'YAML_UNSUPPORTED',
          offset: typeof token.offset === 'number' ? token.offset : 0, // document tokens always have a numeric offset
          field: null,
          message: 'Multiple YAML documents are not supported.',
          fix: 'Remove the `---` separator; keep one mapping.',
        });
      }
    }
    const describe =
      typeof token.type === 'string' && Object.hasOwn(UNSUPPORTED_TOKENS, token.type)
        ? UNSUPPORTED_TOKENS[token.type]
        : undefined;
    if (describe && typeof token.offset === 'number') {
      issues.push({ code: 'YAML_UNSUPPORTED', offset: token.offset, field: null, ...describe(token.source) });
    }
    for (const key of Object.keys(token)) {
      const value = token[key];
      if (value && typeof value === 'object') walk(value);
    }
  };
  for (const token of new Parser().parse(text)) walk(token);
  return issues;
}

/** Field path segment helpers: `image.src`, `items[1].answer`. */
export function joinField(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

export function indexField(prefix: string, index: number): string {
  return `${prefix}[${index}]`;
}

function scalarKey(node: unknown): unknown {
  return isScalar(node) ? node.value : undefined;
}

function keyIdentity(node: unknown): string | null {
  if (!isScalar(node)) return null;
  return `${typeof node.value}:${String(node.value)}`;
}

function collectAstIssues(node: unknown, field: string, issues: RawYamlIssue[]): void {
  if (isMap(node)) {
    const seen = new Set<string>();
    for (const pair of node.items) {
      if (!isPair(pair)) continue;
      const key = pair.key;
      const keyName = scalarKey(key);
      const keyText = keyName === undefined ? null : String(keyName);
      const childField = keyText === null ? field : joinField(field, keyText);
      if (isScalar(key) && key.value === '<<' && key.type === 'PLAIN') {
        issues.push({
          code: 'YAML_UNSUPPORTED',
          offset: nodeOffset(key),
          field: childField,
          message: 'YAML merge keys (`<<`) are not supported.',
          fix: 'Write every field out in full.',
        });
      }
      const identity = keyIdentity(key);
      if (identity !== null) {
        if (seen.has(identity)) {
          issues.push({
            code: 'YAML_DUPLICATE_KEY',
            offset: nodeOffset(key),
            field: childField,
            message: `Duplicate key "${keyText}".`,
            fix: `Keep one \`${keyText}\` in this ${field && /\]$/.test(field) ? 'item' : 'mapping'}.`,
          });
        }
        seen.add(identity);
      }
      if (key && typeof key === 'object' && !isScalar(key)) collectAstIssues(key, field, issues);
      collectAstIssues(pair.value, childField, issues);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) => collectAstIssues(item, indexField(field, index), issues));
  }
}

/**
 * Parses one YAML block.
 *
 * @param {string} text  YAML source (fence or front matter content)
 * @param {{line: number, column: number}} origin  file position of the first YAML character
 * @returns `issues` have `{code, field, message, fix, line, column}`; when
 *   non-empty the contents must not be validated or rendered.
 */
export function parseYaml(text: string, origin: SourcePosition): ParsedYaml {
  const lineCounter = new LineCounter();
  const documents = parseAllDocuments(text, { ...YAML_OPTIONS, lineCounter });
  const position = (offset: number): SourcePosition => {
    const { line, col } = lineCounter.linePos(Math.max(0, Math.min(offset, text.length)));
    return {
      line: origin.line + line - 1,
      column: line === 1 ? origin.column + col - 1 : col,
    };
  };

  const raw: RawYamlIssue[] = [];
  const list = Array.isArray(documents) ? documents : [];
  for (const document of list) {
    for (const error of document.errors) {
      if (error.code === 'DUPLICATE_KEY') continue; // reported by the AST walk, with its field path
      raw.push({
        code: 'YAML_SYNTAX',
        offset: error.pos[0],
        field: null,
        message: `YAML syntax error: ${String(error.message).split('\n')[0]}`,
        fix: 'Check indentation, colons and quotes on this line.',
      });
    }
  }
  raw.push(...collectCstIssues(text));
  const contents = list.length > 0 ? list[0].contents : null;
  if (contents) collectAstIssues(contents, '', raw);

  const issues: YamlIssue[] = raw.map(({ offset, ...rest }) => ({ ...rest, ...position(offset) }));
  const sourceOf = (node: unknown): string =>
    isNode(node) && Array.isArray(node.range) ? text.slice(node.range[0], node.range[1]) : '';
  return { contents: contents ?? null, issues, position, sourceOf };
}

/** Position of a node's value start. */
export function nodeOffset(node: unknown): number {
  return isNode(node) && Array.isArray(node.range) ? node.range[0] : 0;
}

/** Short type name for messages: "a string", "a number", … */
export function describeNode(node: unknown): string {
  if (node === null || node === undefined) return 'nothing';
  if (isAlias(node)) return 'an alias';
  if (isMap(node)) return 'a mapping';
  if (isSeq(node)) return 'a list';
  if (isScalar(node)) {
    const value = node.value;
    if (value === null) return 'an empty value';
    if (typeof value === 'string') return 'a string';
    if (typeof value === 'number' || typeof value === 'bigint') return 'a number';
    if (typeof value === 'boolean') return 'a boolean';
  }
  return 'an unsupported value';
}

export { isMap, isPair, isScalar, isSeq };

/** Decodes strict UTF-8; null when the bytes are not valid UTF-8. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The problems of a parsed file before validation, as file problems. */
export function yamlProblems(parsed: ParsedYaml): FileProblem[] {
  return parsed.issues.map(({ line, column, field, message }) => ({ line, column, field, message }));
}

/** A recorder of file problems at YAML nodes: `at(node, field, message)`. */
export function problemRecorder(parsed: ParsedYaml, problems: FileProblem[]) {
  return (node: unknown, field: string | null, message: string): void => {
    const { line, column } = parsed.position(node ? nodeOffset(node) : 0);
    problems.push({ line, column, field: field || null, message });
  };
}

/** A problem of the file as a whole (its size or encoding), at its start. */
export function fileProblem(message: string): FileProblem {
  return { line: 1, column: 1, field: null, message };
}
