// A long operation as one row, for `operation get`, `list`, `cancel` and recovery.
import type { Operation } from '../core-types.js';

/** One operation as a row: id, kind, state, start, and its error code or stage. */
export function operationRow(operation: Operation): string {
  const detail = operation.error?.code ?? operation.stage ?? '';
  return [operation.id, operation.kind.padEnd(9), operation.state.padEnd(9), operation.startedAt, detail]
    .join('  ')
    .trimEnd();
}

/**
 * The trace of an operation (recorded while traces were exported): its ID, and its address when the template is set.
 */
export function traceLines(trace: Operation['trace']): string[] {
  if (!trace) return [];
  return trace.url ? [`  trace: ${trace.id}`, `  trace URL: ${trace.url}`] : [`  trace: ${trace.id}`];
}
