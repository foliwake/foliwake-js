// A long operation's answer as the operation result: the result its work stored, with the cache refresh as
// the operation has it now (the server goes on refreshing after the commit).
import type { Operation, OperationResult } from '../core-types.js';
import { CoreFailure } from '../remote/core-failure.js';

const isStoredResult = (value: unknown): value is OperationResult =>
  value !== null && typeof value === 'object' && typeof (value as { operationId?: unknown }).operationId === 'string';

function withoutResult(operation: Operation): CoreFailure {
  const message = `The operation is ${operation.state} without a result.`;
  return new CoreFailure(operation.error ?? { code: 'INTERNAL', category: 'internal', retryable: false, message });
}

/** The stored result with the current cache refresh; an operation that stopped before a result throws its error. */
export function finishedResult(operation: Operation): OperationResult {
  const stored = operation.result;
  if (!isStoredResult(stored)) throw withoutResult(operation);
  const delivery = operation.delivery;
  const known =
    delivery && (delivery.state === 'done' || delivery.state === 'pending' || delivery.state === 'not_required');
  const now = known ? { state: delivery.state, reason: delivery.reason ?? null } : stored.delivery;
  return { ...stored, delivery: now } as OperationResult;
}
