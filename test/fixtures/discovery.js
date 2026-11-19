// Discovery documents as the engine serves them (/.well-known/foliwake.json), for tests.

export const ORIGIN = 'https://my-site.example.org';

/** A discovery document as the engine serves it. */
export function discoveryDoc(overrides = {}) {
  return {
    foliwake: { discovery: 1 },
    site: 'my-site',
    live: { url: ORIGIN },
    preview: { url: 'https://my-site.preview.example.org', auth: { type: 'basic', username: 'preview' } },
    media: { cdn: 'https://media.example.org' },
    contracts: { plain: 2, html: 2, blocks: 2, hook: 1 },
    hooks: { events: ['delivery.settled', 'ping'], signature: 'v1' },
    ...overrides,
  };
}

export function jsonResponse(body, init = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = { 'content-type': 'application/json; charset=utf-8', ...(init.headers ?? {}) };
  return new Response(text, { status: init.status ?? 200, headers });
}

