// One signer and one delivery, one set of keys and paths: shared by the @foliwake/server signing test
// (test/server-service-token.test.js) and the engine's origin round trip, which keeps an identical copy:
// change both together, so that the app server and delivery agree on what a token names. Keys are made per
// run; none is committed.
import { exportJWK, generateKeyPair } from 'jose';

export const SITE = 'local';
export const ISSUER = 'my-app';
export const KID = 'app-2026-11';
export const OLD_KID = 'app-2026-05';
export const PRIVATE_KEY_ENV = 'FOLIWAKE_LIVE_SIGNING_KEY';

async function pair(kid) {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  return {
    publicJwk: { ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' },
    privateJwk: { ...(await exportJWK(privateKey)), kid, alg: 'ES256' },
  };
}

/** The current key and the one being rotated out, both listed in the delivery's key set. */
export const current = await pair(KID);
export const previous = await pair(OLD_KID);
/** A key nobody lists, under the current kid: a forged signature. */
export const stranger = await pair(KID);

/** What a delivery Worker holds in TOKEN_PUBLIC_JWK: a JWK Set during a rotation. */
export const PUBLIC_KEY_SET = JSON.stringify({ keys: [current.publicJwk, previous.publicJwk] });

/** The app server's environment: the private key as JWK JSON text. */
export const signerEnv = (jwk = current.privateJwk) => ({ [PRIVATE_KEY_ENV]: JSON.stringify(jwk) });

/** A `foliwake.remote.json` whose live endpoint signs service tokens. */
export function serviceTokenConfig(liveUrl, { kid = KID, issuer = ISSUER } = {}) {
  return {
    version: 2,
    site: SITE,
    live: { url: liveUrl, auth: { type: 'service-token', issuer, kid, privateKeyEnv: PRIVATE_KEY_ENV } },
    app: { pages: ['/lessons/**'] },
  };
}

/**
 * Requests an app server makes for closed content, and the exact `path` claim each token must carry: the
 * page, its plain body, an index with a query (the query is not part of the path), and HEAD.
 */
export const CLOSED_REQUESTS = [
  { method: 'GET', path: '/lessons/a', claim: '/lessons/a' },
  { method: 'GET', path: '/lessons/a.plain.html', claim: '/lessons/a.plain.html' },
  { method: 'GET', path: '/mixed.json?offset=0&limit=1', claim: '/mixed.json' },
  { method: 'HEAD', path: '/lessons/a.plain.html', claim: '/lessons/a.plain.html' },
];
