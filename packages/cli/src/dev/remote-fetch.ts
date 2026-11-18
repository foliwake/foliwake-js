// Reading a response of the remote site in `foliwake dev --remote` (remote-dev.ts):
// a size limit on the body and a short reason for a failed request.

/** The body is over the limit; the rest of it was cancelled. */
export class TooLarge extends Error {}

export async function readLimited(response: Response, limit: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => {});
    throw new TooLarge();
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new TooLarge();
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export function errorReason(error: unknown): string {
  const cause =
    error !== null && typeof error === 'object' && 'cause' in error ? (error as { cause?: unknown }).cause : null;
  const code =
    cause !== null && typeof cause === 'object' && 'code' in cause ? String((cause as { code: unknown }).code) : null;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    return 'no answer within the time limit';
  return code ?? (error instanceof Error ? error.message : String(error));
}
