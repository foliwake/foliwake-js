// tRPC's HTTP wire as a Foliwake server speaks it on `/api/rpc` (no transformer, no batching): a query is
// `GET <path>?input=<JSON>`, a mutation `POST <path>` with the JSON input; the answer is
// `{ result: { data } }` or `{ error: { message, code, data } }`. Written out here, so the CLI needs no
// tRPC packages.

export type ProcedureType = 'query' | 'mutation';

/** The server answered with tRPC's error shape; `data` holds its `coreError`. */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly data: Record<string, unknown> | null,
  ) {
    super(message);
  }
}

/** No answer, or one that is not tRPC's: a network failure, a proxy's page, a wrong address. */
export class RpcTransportError extends Error {}

export interface RpcRequest {
  url: string;
  type: ProcedureType;
  input: unknown;
  headers: Record<string, string>;
  fetch: typeof fetch;
}

function requestOf({ url, type, input, headers }: RpcRequest): { url: string; init: RequestInit } {
  if (type === 'query') {
    const query = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
    return { url: `${url}${query}`, init: { method: 'GET', headers } };
  }
  const body = input === undefined ? undefined : JSON.stringify(input);
  return { url, init: { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body } };
}

async function answerOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = (await response.json()) as unknown;
    if (json && typeof json === 'object') return json as Record<string, unknown>;
  } catch {
    // not JSON: below
  }
  throw new RpcTransportError(`HTTP ${response.status} without a tRPC answer`);
}

function failure(error: unknown): RpcError {
  const shape = (error && typeof error === 'object' ? error : {}) as { message?: unknown; data?: unknown };
  const data = shape.data && typeof shape.data === 'object' ? (shape.data as Record<string, unknown>) : null;
  return new RpcError(typeof shape.message === 'string' ? shape.message : 'tRPC error', data);
}

/** One call; resolves to `result.data`, rejects with RpcError or RpcTransportError. */
export async function rpcCall(request: RpcRequest): Promise<unknown> {
  const { url, init } = requestOf(request);
  let response: Response;
  try {
    response = await request.fetch(url, init);
  } catch (error) {
    throw new RpcTransportError(error instanceof Error ? error.message : String(error));
  }
  const answer = await answerOf(response);
  if ('error' in answer) throw failure(answer.error);
  const result = answer.result as { data?: unknown } | undefined;
  if (!result || typeof result !== 'object') throw new RpcTransportError(`HTTP ${response.status}: no result`);
  return result.data;
}
