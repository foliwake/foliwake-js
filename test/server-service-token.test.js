// @foliwake/server/origin with `auth.type: "service-token"`: a fresh ES256 token per request, for the exact
// path on the wire, with the key read from the named variable each time and never shown.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { FoliwakeConfigError, parseFoliwakeConfig } from '@foliwake/server/config';
import { SERVICE_TOKEN_LIFETIME_SECONDS, createOriginClient } from '@foliwake/server/origin';
import {
  CLOSED_REQUESTS,
  ISSUER,
  KID,
  PRIVATE_KEY_ENV,
  SITE,
  current,
  previous,
  serviceTokenConfig,
  signerEnv,
} from './helpers/service-token-fixture.js';

const LIVE = 'https://delivery.example';

function recordingClient(env, { config = serviceTokenConfig(LIVE), now } = {}) {
  const sent = [];
  const fetch = async (url, init) => {
    sent.push({ url, ...init });
    return new Response('ok');
  };
  const client = createOriginClient(parseFoliwakeConfig(JSON.stringify(config)), env, { fetch, now });
  return { client, sent };
}

const tokenOf = (request) => /^Bearer (.+)$/.exec(request.headers.Authorization)[1];

describe('service-token signing', () => {
  test('each request carries its own ES256 token for its exact path, verifiable with the public key', async () => {
    const { client, sent } = recordingClient(signerEnv());
    const publicKey = await importJWK(current.publicJwk, 'ES256');
    for (const { method, path, claim } of CLOSED_REQUESTS) {
      await client.request('live', path, { method });
      const request = sent.at(-1);
      assert.equal(request.url, `${LIVE}${path}`);
      assert.equal(request.method, method);
      const token = tokenOf(request);
      assert.deepEqual(decodeProtectedHeader(token), { alg: 'ES256', kid: KID, typ: 'JWT' });
      const expected = { issuer: ISSUER, audience: `site:${SITE}`, algorithms: ['ES256'] };
      const { payload } = await jwtVerify(token, publicKey, expected);
      assert.equal(payload.path, claim, path);
      assert.equal(payload.exp - payload.iat, SERVICE_TOKEN_LIFETIME_SECONDS);
      assert.deepEqual(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'path']);
    }
    assert.equal(new Set(sent.map(tokenOf)).size, sent.length, 'no token is reused');
  });

  test('the path claim is the path as sent: dot segments resolved, characters percent-encoded', async () => {
    const { client, sent } = recordingClient(signerEnv());
    await client.request('live', '/lessons/x/../a b');
    assert.equal(sent[0].url, `${LIVE}/lessons/a%20b`);
    assert.equal(decodeJwt(tokenOf(sent[0])).path, '/lessons/a%20b');
  });

  test('iat comes from the clock; exp is iat + 60', async () => {
    const now = Date.parse('2026-11-16T10:00:00Z');
    const { client, sent } = recordingClient(signerEnv(), { now: () => now });
    await client.request('live', '/lessons/a');
    const { iat, exp } = decodeJwt(tokenOf(sent[0]));
    assert.equal(iat, now / 1000);
    assert.equal(exp, now / 1000 + 60);
  });

  test('the key is read at each request: a rotated value signs the next one', async () => {
    const env = signerEnv();
    const config = serviceTokenConfig(LIVE);
    const { client, sent } = recordingClient(env, { config });
    await client.request('live', '/lessons/a');
    env[PRIVATE_KEY_ENV] = JSON.stringify({ ...previous.privateJwk, kid: KID });
    await client.request('live', '/lessons/a');
    await assert.doesNotReject(jwtVerify(tokenOf(sent[0]), await importJWK(current.publicJwk, 'ES256')));
    await assert.doesNotReject(jwtVerify(tokenOf(sent[1]), await importJWK(previous.publicJwk, 'ES256')));
  });

  test('a missing, malformed, public or mismatched key refuses the request and never shows the value', async () => {
    const { d } = current.privateJwk;
    const cases = [
      [{}, /needs an ES256 private key .* FOLIWAKE_LIVE_SIGNING_KEY .* not set/],
      [{ [PRIVATE_KEY_ENV]: `{"d":"${d}",` }, /is not valid JSON/],
      [{ [PRIVATE_KEY_ENV]: JSON.stringify(current.publicJwk) }, /must be an ES256 private key/],
      [{ [PRIVATE_KEY_ENV]: JSON.stringify({ ...current.privateJwk, kty: 'RSA' }) }, /must be an ES256 private key/],
      [{ [PRIVATE_KEY_ENV]: JSON.stringify({ ...current.privateJwk, alg: 'RS256' }) }, /"alg" must be "ES256"/],
      [
        { [PRIVATE_KEY_ENV]: JSON.stringify(previous.privateJwk) },
        /has kid "app-2026-05", but the config names kid "app-2026-11"/,
      ],
      [{ [PRIVATE_KEY_ENV]: JSON.stringify({ ...current.privateJwk, x: 'AAAA' }) }, /could not be read/],
    ];
    for (const [env, pattern] of cases) {
      const { client, sent } = recordingClient(env);
      await assert.rejects(client.request('live', '/lessons/a'), (error) => {
        assert.ok(error instanceof FoliwakeConfigError, error.message);
        assert.match(error.message, pattern);
        assert.ok(!error.message.includes(d), 'the private key never appears in a message');
        return true;
      });
      assert.equal(sent.length, 0, 'nothing is sent without a token');
    }
  });

  test('basic auth is unchanged', async () => {
    const basic = { type: 'basic', username: 'owner', passwordEnv: 'FOLIWAKE_LIVE_PASSWORD' };
    const config = { ...serviceTokenConfig(LIVE), live: { url: LIVE, auth: basic } };
    const { client, sent } = recordingClient({ FOLIWAKE_LIVE_PASSWORD: 'pw' }, { config });
    await client.request('live', '/lessons/a');
    assert.equal(sent[0].headers.Authorization, `Basic ${Buffer.from('owner:pw').toString('base64')}`);
  });
});
