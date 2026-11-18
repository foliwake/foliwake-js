import { COMMAND } from '../settings.js';
import type { Operation } from '../core-types.js';
import type { BranchResultCore } from '../core-types.js';
import { describeBranchUrls } from '../lib/rules.js';

const C = COMMAND;

/** The lines of a branch write, and its exit status: 0 when it did what was asked (a no-op included), else 1. */
export function branchWriteReport(
  operation: Operation,
  done: (result: BranchResultCore) => string[],
): { lines: string[]; exitCode: number } {
  // The result was checked against its kind's schema when it was stored.
  const result = (operation.result ?? null) as BranchResultCore | null;
  const lines: string[] = [];
  if (result?.prepared && result.prepared.codeRelease)
    lines.push(
      `Prepared ${result.prepared.codeRelease} from ${result.prepared.sourceRevision ?? 'an unknown commit'}.`,
    );
  if (operation.state === 'succeeded' && result) {
    lines.push(...(result.state === 'noop' ? [`Nothing to do: ${result.message ?? 'already so.'}`] : done(result)));
    if (result.hostNote) lines.push(`Note: ${result.hostNote}`);
    return { lines, exitCode: 0 };
  }
  const error = operation.error;
  if (operation.state === 'unknown')
    lines.push(
      `${operation.kind}: whether it committed is not known yet (${error?.code ?? 'COMMIT_UNKNOWN'}); \`${C} ` +
        `operation recover\` finds out and never runs it again.`,
    );
  else lines.push(`${operation.kind} ${operation.state}${error ? ` (${error.code}): ${error.message}` : ''}`);
  for (const item of result?.prepared?.diagnostics ?? [])
    lines.push(`  ${item.severity} ${item.code} ${item.file}:${item.line}:${item.column} ${item.message}`);
  return { lines, exitCode: 1 };
}

/** Where a branch is shown: its site branch host first, then its readable host, then its label host. */
export const branchUrls = (result: BranchResultCore): string =>
  describeBranchUrls({ site: result.siteBranchUrl, readable: null, label: result.previewUrl ?? '' });
