// A fake Foliwake server for the CLI's tests, driven by the contract's manifest: `/api/rpc/<procedure>` answers
// tRPC's wire for every procedure of @foliwake/core-contract (a query only on GET, a mutation only on POST, as a
// real server), from the handlers a test gives; the device flow (`/api/auth/*`) approves on the first poll;
// `/api/version` answers the contract's digest. Every request is recorded.
import http from 'node:http';

import { CONTRACT_DIGEST, CORE_API, PROCEDURES } from '@foliwake/core-contract';

export const FAKE_TOKEN = 'fwk_fake-token-0123456789';
export const OWNER_GRANT = {
  principal: 'account:acc_owner',
  installation: true,
  memberships: [{ org: 'acme-org', role: 'admin', live: true, sites: null }],
};

const coreError = (code, category, message) => ({ code, category, retryable: false, message });

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function rpcError(res, status, error, path) {
  send(res, status, {
    error: { message: error.message, code: -32000, data: { code: 'X', httpStatus: status, path, coreError: error } },
  });
}

async function bodyOf(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

async function inputOf(req, url) {
  if (req.method === 'POST') return bodyOf(req);
  const raw = url.searchParams.get('input');
  return raw === null ? undefined : JSON.parse(raw);
}

/**
 * `handlers`: procedure → (input, { token, request }) => answer, or a thrown `{ coreError }` for a failure.
 * `manifest`: the procedures this server has (default: the contract's), to play an older server.
 */
export async function startFakeCoreServer({ handlers = {}, manifest = PROCEDURES, tokens = [FAKE_TOKEN] } = {}) {
  const requests = [];
  const allowed = new Set(tokens);
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => send(res, 500, { error: { message: String(error) } }));
  });

  async function rpc(req, res, url, request) {
    const path = url.pathname.slice('/api/rpc/'.length);
    const type = Object.hasOwn(manifest, path) ? manifest[path] : undefined;
    if (type === undefined) {
      return rpcError(
        res,
        404,
        coreError('PROCEDURE_UNKNOWN', 'not_found', `This server has no operation ${path}.`),
        path,
      );
    }
    if ((type === 'query') !== (req.method === 'GET'))
      return send(res, 405, { error: { message: 'METHOD_NOT_SUPPORTED', data: { code: 'METHOD_NOT_SUPPORTED' } } });
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null;
    if (token !== null && !allowed.has(token))
      return rpcError(res, 401, coreError('TOKEN_INVALID', 'unauthorized', 'The sign-in token is not valid.'), path);
    if (token === null && path !== 'sites.list')
      return rpcError(res, 401, coreError('UNAUTHORIZED', 'unauthorized', 'Sign in first.'), path);
    const input = await inputOf(req, url);
    request.input = input;
    const handler = handlers[path] ?? (path === 'whoami' ? () => OWNER_GRANT : null);
    if (!handler)
      return rpcError(res, 500, coreError('FAKE_NO_HANDLER', 'internal', `The fake has no handler for ${path}.`), path);
    try {
      send(res, 200, { result: { data: await handler(input, { token, request }) } });
    } catch (error) {
      if (!error?.coreError) throw error;
      rpcError(res, error.status ?? 409, error.coreError, path);
    }
  }

  async function auth(req, res, url) {
    if (url.pathname === '/api/auth/device/code') {
      const body = await bodyOf(req);
      requests.at(-1).input = body;
      const verification = `${origin}/device`;
      return send(res, 200, {
        device_code: 'dc_1',
        user_code: 'ABCD-EFGH',
        verification_uri: verification,
        verification_uri_complete: `${verification}?code=ABCD-EFGH`,
        expires_in: 60,
        interval: 1,
      });
    }
    if (url.pathname === '/api/auth/device/token')
      return send(res, 200, { access_token: FAKE_TOKEN, token_type: 'Bearer', account_email: 'owner@example.com' });
    if (url.pathname === '/api/auth/logout') {
      res.writeHead(204).end();
      return;
    }
    send(res, 404, { error: { code: 'NOT_FOUND', message: 'There is no such route.' } });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://fake');
    const request = { method: req.method, path: url.pathname, headers: { ...req.headers } };
    requests.push(request);
    if (url.pathname === '/api/version')
      return send(res, 200, { api: CORE_API, engine: '0.0.0-fake', build: null, contract: CONTRACT_DIGEST });
    if (url.pathname.startsWith('/api/rpc/')) return rpc(req, res, url, request);
    if (url.pathname.startsWith('/api/auth/')) return auth(req, res, url);
    send(res, 404, { error: { code: 'NOT_FOUND', message: 'There is no such route.' } });
  }

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    requests,
    handlers,
    rpcCalls: (path) => requests.filter((r) => r.path === `/api/rpc/${path}`),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
}

/** A thrown core failure for a handler. */
export function failure(code, category, message = code, status = 409) {
  return Object.assign(new Error(message), { coreError: coreError(code, category, message), status });
}
