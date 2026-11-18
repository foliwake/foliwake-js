// `source sync` for people: per source a header line (what happened, what did not change, how many
// problems), then every problem grouped by page with its code; snapshot, attempt and the engine's text with --verbose.
import { COMMAND } from '../settings.js';

import type { Operation, SyncResultCore } from '../core-types.js';
import type { Problem } from '../lib/problems.js';
import type { SourceDiagnostic } from '../lib/sync-problems.js';
import { syncProblems } from '../lib/sync-problems.js';
import { canDim, headerLine, problemLines } from './problems.js';

const C = COMMAND;

type SyncOutcome = SyncResultCore['results'][number];

// Results stored before `problems` existed: made from their diagnostics (no page facts: the rules are not at hand).
const problemsOf = (result: SyncOutcome): Problem[] =>
  result.problems ?? syncProblems(result.diagnostics as SourceDiagnostic[]);

function header(result: SyncOutcome, problems: readonly Problem[]): string {
  const name = `Source ${result.source}`;
  if (result.status === 'selected')
    return headerLine(
      [
        `${name}: new changes accepted (${result.items.length} page(s))`,
        'preview and live unchanged until you update them',
      ],
      problems,
    );
  if (result.status === 'unchanged')
    return headerLine([`${name}: no changes (${result.items.length} page(s))`], problems);
  if (result.status === 'skipped') return `${name}: skipped (${result.message}).`;
  if (result.status === 'cancelled') return headerLine([`${name}: sync cancelled`, 'nothing changed'], problems);
  const kept = result.selected ? 'the previously accepted content stays' : 'nothing was accepted before';
  return headerLine([`${name}: new changes not accepted`, kept, 'preview and published pages unchanged'], problems);
}

function details(result: SyncOutcome): string[] {
  const lines = [
    `  status ${result.status}${result.code ? ` (${result.code})` : ''}` +
      (result.attempt === null ? '' : `, attempt ${result.attempt}`),
  ];
  if (result.snapshot) lines.push(`  snapshot ${result.snapshot}`);
  if (result.selected)
    lines.push(`  selected snapshot ${result.selected.snapshot} (since ${result.selected.selected_at})`);
  if (result.mode === 'working-folder')
    lines.push('  working folder: preview and publish read the folder at command start; this snapshot validates it');
  if (result.revision) lines.push(`  upstream revision ${result.revision}`);
  lines.push(`  engine: ${result.message}`);
  return lines;
}

export function syncLines(
  operation: Operation,
  validationCode: string | undefined,
  { verbose = false, dim = canDim() }: { verbose?: boolean; dim?: boolean } = {},
): string[] {
  const results = ((operation.result ?? { results: [] }) as SyncResultCore).results;
  if (results.length === 0 && operation.state !== 'succeeded')
    return [
      `sync ${operation.state}${operation.error ? ` (${operation.error.code}): ${operation.error.message}` : ''}`,
    ];
  const lines: string[] = [];
  for (const result of results) {
    const problems = problemsOf(result);
    lines.push(header(result, problems));
    // A failure without any diagnostic (a refused or failed attempt): its reason is the engine's message.
    if (!result.accepted && result.status !== 'skipped' && problems.length === 0 && !verbose)
      lines.push(`  ${result.message}`);
    lines.push(...problemLines(problems, { verbose, indent: '  ', dim }));
    if (verbose) lines.push(...details(result));
  }
  lines.push('Sync changes neither preview nor live.');
  if (validationCode)
    lines.push(
      `Checked against code ${validationCode}, for its migration: continue with \`${C} migration prepare ` +
        `${validationCode}\`. Until it commits, preview and publish compile with live code and can refuse this ` +
        `content.`,
    );
  if (!verbose && results.some((result) => !result.accepted && result.status !== 'skipped'))
    lines.push('Technical details (snapshot, attempt, engine text): --verbose.');
  return lines;
}
