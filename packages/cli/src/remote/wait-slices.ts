// `operations.wait` against a server, in slices: one HTTP request must not outlive the server's request
// timeout (60 s), so the wait is asked again until it is reached or the time is up.
import type { CoreOutput } from '@foliwake/core-contract';

export type Operation = CoreOutput<'operations.get'>;

/** One wait request to a server: well under its request timeout. */
export const REMOTE_WAIT_SLICE_MS = 25_000;

/**
 * Far enough, as the server decides it: past the commit (or finished, for kinds without one), and for
 * `delivery` also past the cache refresh: done, or pending with a reason (nobody waits for it any more).
 */
export function waitReached(operation: Operation, until: 'commit' | 'delivery'): boolean {
  if (operation.state === 'queued' || operation.state === 'running') return false;
  const delivery = operation.delivery;
  return until === 'commit' || delivery?.state !== 'pending' || delivery.reason !== undefined;
}

export interface SliceOptions {
  until: 'commit' | 'delivery';
  timeoutMs: number;
  sliceMs?: number;
  now?: () => number;
}

export async function waitInSlices(
  wait: (sliceMs: number) => Promise<Operation>,
  { until, timeoutMs, sliceMs = REMOTE_WAIT_SLICE_MS, now = Date.now }: SliceOptions,
): Promise<Operation> {
  const deadline = now() + timeoutMs;
  for (;;) {
    const remaining = Math.max(0, deadline - now());
    const operation = await wait(Math.min(remaining, sliceMs));
    if (waitReached(operation, until) || remaining <= sliceMs) return operation;
  }
}
