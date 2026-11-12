/** A configuration problem; the message is shown as is (it never contains a secret). */
export class FoliwakeConfigError extends Error {
  override name = 'FoliwakeConfigError';
}

/** Why a page cannot be shown (`FoliwakePageError.kind`). */
export type PageErrorKind = 'not_found' | 'not_allowed' | 'origin' | 'invalid' | 'unauthorized' | 'too_large';

/** A page that cannot be shown. `status`: the origin's HTTP status when there was one. */
export class FoliwakePageError extends Error {
  override name = 'FoliwakePageError';
  readonly kind: PageErrorKind;
  readonly status?: number;
  constructor(kind: PageErrorKind, message: string, opts: { status?: number; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.kind = kind;
    if (opts.status !== undefined) this.status = opts.status;
  }
}
