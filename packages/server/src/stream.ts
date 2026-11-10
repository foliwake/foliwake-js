// Streamed size limits: Content-Length is checked first, then every chunk is counted, so a response that
// lies about (or omits) its length is still cut at the limit.

export class TooLargeError extends Error {
  override name = 'TooLargeError';
}

function declaredLength(response: Response): number | null {
  const value = response.headers.get('content-length');
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/** Whether the declared Content-Length is already over the limit. */
export function declaredTooLarge(response: Response, limit: number): boolean {
  const length = declaredLength(response);
  return length !== null && length > limit;
}

/** Reads the whole body, throwing TooLargeError (and cancelling) past `limit` bytes. */
export async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  if (declaredTooLarge(response, limit)) {
    await response.body?.cancel().catch(() => {});
    throw new TooLargeError(`larger than ${limit} bytes`);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new TooLargeError(`larger than ${limit} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** The body passed through with a byte counter: the stream errors (the client sees a cut response) past `limit`. */
export function limitStream(body: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  let total = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > limit) controller.error(new TooLargeError(`larger than ${limit} bytes`));
        else controller.enqueue(chunk);
      },
    }),
  );
}
