// A stub Foliwake origin for the app packages' tests: routes by exact path, records every request
// (method, path, headers) so tests can assert what was (not) forwarded.
import http from 'node:http';

export async function startStubOrigin(routes = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://stub');
    requests.push({ method: req.method, path: url.pathname, search: url.search, headers: { ...req.headers } });
    const route = routes[url.pathname];
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    if (typeof route === 'function') return route(req, res);
    res.writeHead(route.status ?? 200, route.headers ?? {});
    res.end(req.method === 'HEAD' ? undefined : route.body ?? '');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    requests,
    routes,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}

export const CD = `cd_${'a1'.repeat(16)}`;
export const SHA = 'b2'.repeat(32);

/** A config v2 text for a stub origin. */
export function configText({ live, preview, app = {}, site = 'demo' } = {}) {
  const endpoint = (url, env) => (url ? { url, auth: { type: 'basic', username: 'app', passwordEnv: env } } : undefined);
  return JSON.stringify({
    version: 2,
    site,
    ...(live ? { live: endpoint(live, 'DEMO_LIVE_PASSWORD') } : {}),
    ...(preview ? { preview: endpoint(preview, 'DEMO_PREVIEW_PASSWORD') } : {}),
    app: { pages: ['/lessons/**', '/'], blocks: { entry: 'scripts/blocks.js', eventPrefix: 'demo' }, ...app },
  });
}
