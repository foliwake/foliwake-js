// A core caller that calls a server: `core.sites.status(input)` becomes the tRPC query `sites.status` on
// `<server>/api/rpc`, with the sign-in token. Which procedures exist and which are queries comes from the
// contract (`@foliwake/core-contract`); a server's `CoreError` arrives as a `CoreFailure`.
import { PROCEDURES, type CoreCaller } from '@foliwake/core-contract';

import { clientName } from '../version.js';
import { type CoreError, CoreFailure } from './core-failure.js';
import { RpcError, RpcTransportError, rpcCall } from './rpc-wire.js';

export const RPC_PATH = '/api/rpc';

/** The header the caller names its client in; servers log it. */
export const CLI_HEADER = 'X-Foliwake-Cli';

function unreachable(origin: string, cause: unknown): CoreFailure {
  const message = `The server ${origin} cannot be reached or did not answer as a Foliwake server.`;
  return new CoreFailure({ code: 'SERVER_UNREACHABLE', category: 'unavailable', retryable: true, message }, cause);
}

function failureOf(error: unknown, origin: string): CoreFailure {
  if (error instanceof RpcTransportError) return unreachable(origin, error);
  if (error instanceof RpcError) {
    const coreError = error.data?.coreError as CoreError | null | undefined;
    if (coreError) return new CoreFailure(coreError, error);
    if (error.data == null) return unreachable(origin, error);
  }
  const message = `The server ${origin} answered unexpectedly.`;
  return new CoreFailure({ code: 'SERVER_FAILED', category: 'internal', retryable: false, message }, error);
}

export interface RemoteCallerOptions {
  origin: string;
  token: string | null;
  /** The procedures this client knows, with their kind (default: the contract's). */
  manifest?: Readonly<Record<string, 'query' | 'mutation'>>;
  /** Sent as X-Foliwake-Cli (default: this package's name and version). */
  client?: string;
  fetch?: typeof fetch;
}

function headersOf(token: string | null, client: string): Record<string, string> {
  return { [CLI_HEADER]: client, ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

export function createRemoteCaller(options: RemoteCallerOptions): CoreCaller {
  const { origin, token, manifest = PROCEDURES, client = clientName(), fetch: fetchImpl = fetch } = options;
  const headers = headersOf(token, client);

  const call = async (path: string, input: unknown) => {
    const type = Object.hasOwn(manifest, path) ? manifest[path] : undefined;
    if (type === undefined) throw new TypeError(`core has no procedure ${path}`);
    const url = `${origin}${RPC_PATH}/${path}`;
    try {
      return await rpcCall({ url, type, input, headers, fetch: fetchImpl });
    } catch (error) {
      throw failureOf(error, origin);
    }
  };

  const node = (path: string[]): unknown =>
    new Proxy(() => {}, {
      get: (_target, key) => (typeof key === 'string' && key !== 'then' ? node([...path, key]) : undefined),
      apply: (_target, _this, args: unknown[]) => call(path.join('.'), args[0]),
    });
  // The proxy answers every path the contract's type allows; `call` refuses one the manifest lacks.
  return node([]) as CoreCaller;
}
