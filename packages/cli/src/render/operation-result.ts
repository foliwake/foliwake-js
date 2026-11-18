import { COMMAND } from '../settings.js';
import type { Operation } from '../core-types.js';
import type { OperationResult } from '../core-types.js';
import { finishedResult } from '../lib/operation-result.js';

const C = COMMAND;

const SUCCEEDED: ReadonlySet<string> = new Set(['done', 'committed', 'invalidation_pending', 'noop']);

/** Whether a finished operation did what was asked (a no-op re-run included). */
export const succeeded = (result: OperationResult): boolean => SUCCEEDED.has(result.state);

/** ` (sr_…, generation 7)` after a verb, or nothing without a release. */
function releaseNote({ siteRelease, generation }: OperationResult): string {
  if (!siteRelease) return '';
  return ` (${siteRelease}${generation === null ? '' : `, generation ${generation}`})`;
}

/**
 * Exit status of a live commit: 1 not done, 3 committed with its cache refresh still pending (as `operation recover
 * --wait`), else 0.
 */
export function exitCodeOf(result: OperationResult): number {
  if (!succeeded(result)) return 1;
  return result.delivery?.state === 'pending' ? 3 : 0;
}

/** The lines every long operation prints: what happened, its problems, and its cache refresh. */
export function operationResultLines(result: OperationResult, verb: string): string[] {
  const lines: string[] = [];
  if (!succeeded(result))
    lines.push(`${result.state}${result.code ? ` (${result.code})` : ''}: ${result.message ?? 'no message'}`);
  else lines.push(`${verb}${releaseNote(result)}.${result.message ? ` ${result.message}` : ''}`);
  for (const item of result.diagnostics)
    lines.push(`  ${item.severity} ${item.code} ${item.file}:${item.line}:${item.column} ${item.message}`);
  for (const warning of result.warnings) lines.push(`Warning: ${warning}`);
  if (result.delivery?.state === 'pending')
    lines.push(
      `Cache refresh still pending${result.delivery.reason ? ` (${result.delivery.reason})` : ''}; \`${C} operation ` +
        `recover --wait\` finishes it. Visitors may see the previous version until then.`,
    );
  return lines;
}

/** A long write followed to its end: the result it stored, or null when it stopped before the engine answered. */
function resultOrNull(operation: Operation): OperationResult | null {
  try {
    return finishedResult(operation);
  } catch {
    return null;
  }
}

/** The lines of a long write, and its exit status as for any live commit (exitCodeOf). */
export function longWriteReport(operation: Operation, verb: string): { lines: string[]; exitCode: number } {
  const result = resultOrNull(operation);
  if (result) return { lines: operationResultLines(result, verb), exitCode: exitCodeOf(result) };
  const error = operation.error;
  if (operation.state === 'unknown')
    return {
      lines: [
        `${operation.kind}: whether it committed is not known yet (${error?.code ?? 'COMMIT_UNKNOWN'}); \`${C} ` +
          `operation recover\` finds out and never runs it again.`,
      ],
      exitCode: 1,
    };
  return {
    lines: [`${operation.kind} ${operation.state}${error ? ` (${error.code}): ${error.message}` : ''}`],
    exitCode: 1,
  };
}
