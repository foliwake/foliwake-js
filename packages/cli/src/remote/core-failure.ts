// The one error shape of core, as a client holds it: `CoreError` is what the server answered (or what this
// client says when the server could not answer), `CoreFailure` the thrown error that carries it.
import type { CoreError } from '@foliwake/core-contract';

export type { CoreError };

export class CoreFailure extends Error {
  readonly coreError: CoreError;

  constructor(coreError: CoreError, cause?: unknown) {
    super(coreError.message, { cause });
    this.name = 'CoreFailure';
    this.coreError = coreError;
  }
}

/** Anything thrown, as a CoreFailure: a CoreFailure as it is, anything else as INTERNAL. */
export function toCoreFailure(error: unknown): CoreFailure {
  if (error instanceof CoreFailure) return error;
  const message = 'The operation failed unexpectedly.';
  return new CoreFailure({ code: 'INTERNAL', category: 'internal', retryable: false, message }, error);
}
