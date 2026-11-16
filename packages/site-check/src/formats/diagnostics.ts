// Diagnostics: one form for every problem the platform reports about a site, locally and on the server.
// Every key is present, in this order: code, severity, file, line, column, component, field, message, fix.
// The severity of a code is fixed by the catalogue below; a code not listed is an error.

export const SEVERITY = Object.freeze({ error: 'error', warning: 'warning', info: 'info' } as const);
export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY];

/** A diagnostic: every key present, in contract key order. */
export interface Diagnostic {
  code: string;
  severity: Severity;
  /** the path from the site root, posix separators */
  file: string;
  /** 1-based */
  line: number;
  /** 1-based */
  column: number;
  /** the block (component) the problem belongs to */
  component: string | null;
  /** a JSON pointer into a JSON file, a YAML field path, or a front matter field */
  field: string | null;
  message: string;
  fix: string | null;
}

/** The codes that are warnings: reported, never blocking. */
export const WARNING_CODES: ReadonlySet<string> = new Set([
  'CONTENT_HEADING_SKIP',
  'CONTENT_TABLE_RAGGED',
  'CONTENT_TABLE_EMPTY',
  'CONTENT_TABLE_MALFORMED',
  'CONTENT_LINK_UNKNOWN_PATH',
  'CONTENT_IMAGE_ALT_MISSING',
  'COMPONENT_FENCE_CASE',
  'CODE_ASSET_UNDECLARED',
  'SECTION_SETEXT_HEADING',
  'SECTION_RULE_NOT_SEPARATOR',
  'SECTION_EMPTY',
  'CONTENT_FRONT_MATTER_FIELD_SUSPECT',
  'CONTENT_PATH_OVERRIDES_MAPPING',
  'MAPPINGS_RULE_UNUSED',
  'MAPPINGS_RULE_SHADOWED',
  'REFERENCE_UNKNOWN',
  'REFERENCE_VALUE_INVALID',
  // Limits of site code: warnings first, errors in a later minor version.
  'CODE_FILE_TOO_LARGE',
  'CODE_RELEASE_TOO_LARGE',
]);

/** The codes that are notes: something the author may not expect, never a problem. */
export const INFO_CODES: ReadonlySet<string> = new Set(['CODE_PATH_IGNORED']);

export interface DiagnosticInput {
  code: string;
  file: string;
  line?: number;
  column?: number;
  component?: string | null;
  field?: string | null;
  message: string;
  fix?: string | null;
}

export function severityOf(code: string): Severity {
  if (WARNING_CODES.has(code)) return SEVERITY.warning;
  if (INFO_CODES.has(code)) return SEVERITY.info;
  return SEVERITY.error;
}

/** Builds a diagnostic with every key present, in contract key order. */
export function makeDiagnostic(input: DiagnosticInput): Diagnostic {
  const { code, file, line = 1, column = 1, component = null, field = null, message, fix = null } = input;
  return { code, severity: severityOf(code), file, line, column, component, field, message, fix };
}

function compareStrings(a: string | null | undefined, b: string | null | undefined): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
}

/** Sorted by file, line and column; code, field and message break ties, so the order is fully deterministic. */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    compareStrings(a.file, b.file) ||
    a.line - b.line ||
    a.column - b.column ||
    compareStrings(a.code, b.code) ||
    compareStrings(a.field, b.field) ||
    compareStrings(a.message, b.message)
  );
}

export function sortDiagnostics(list: readonly Diagnostic[]): Diagnostic[] {
  return [...list].sort(compareDiagnostics);
}

export function hasErrors(list: readonly Diagnostic[]): boolean {
  return list.some((d) => d.severity === SEVERITY.error);
}

/**
 * The terminal form:
 *   file:line:col severity CODE [component] [field]: message
 *       fix: …
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  const { file, line, column, severity, code, component, field, message, fix } = diagnostic;
  let head = `${file}:${line}:${column} ${severity} ${code}`;
  if (component) head += ` ${component}`;
  if (field) head += ` ${field}`;
  head += `: ${message}`;
  return fix ? `${head}\n    fix: ${fix}` : head;
}

// Levenshtein distance, for "Did you mean …?" suggestions.
function distance(a: string, b: string): number {
  const row: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] as number;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] as number;
      const substitution = previous + (a[i - 1] === b[j - 1] ? 0 : 1);
      row[j] = Math.min(current + 1, (row[j - 1] as number) + 1, substitution);
      previous = current;
    }
  }
  return row[b.length] as number;
}

/** Closest allowed name within `maxDistance` edits (or a case-only difference), else null. */
export function suggestName(name: string, allowed: Iterable<string>, maxDistance = 2): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of allowed) {
    const d = candidate.toLowerCase() === name.toLowerCase() ? 0 : distance(name, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= maxDistance ? best : null;
}
