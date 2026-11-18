// One-line summaries the commands print: the source inputs a release was built from, and what each path
// mapping rule of a source catches.

/** A source input of a release: the snapshot it read and the upstream revision, if any. */
export type SourceInputs = Record<string, { snapshot: string; revision?: string | null }>;

/** One entry per pinned source: `docs=ss_… (r2)`. */
export function describeInputs(inputs: SourceInputs | null): string {
  if (!inputs || Object.keys(inputs).length === 0) return 'working folders only';
  return Object.entries(inputs)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([source, input]) => `${source}=${input.snapshot}${input.revision ? ` (${input.revision})` : ''}`)
    .join(', ');
}

/** What one rule catches in a dry run of a source's path mapping rules. */
export interface RuleCoverage {
  rule: number;
  match: string;
  documents: number;
  shadowed: number;
  shadowedBy: number[];
  example: string | null;
  ignoreNotChecked?: boolean;
}

function coverageText(row: RuleCoverage): string {
  if (row.ignoreNotChecked && row.shadowed === 0) return `rule ${row.rule}: ignore, not checked against the snapshot`;
  const by = row.shadowedBy.join(', ');
  const hidden = row.shadowed > 0 ? ` (${row.shadowed} shadowed by rule ${by}: ${row.example})` : '';
  return `rule ${row.rule}: ${row.documents}${hidden}`;
}

/** The summary of the rules: `rule 1: 72, rule 3: 0 (2 shadowed by rule 1: …/questions.md)`. */
export function coverageSummary(rows: readonly RuleCoverage[]): string {
  return rows.map(coverageText).join('; ');
}
