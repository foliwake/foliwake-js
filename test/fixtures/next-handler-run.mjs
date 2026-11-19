// Runs @foliwake/next/handler outside Next (node --conditions=react-server, as Next's server bundles resolve
// it): reads requests as JSON from argv[2], prints each answer's status, headers and text as JSON.
const { GET, HEAD, POST, createFoliwakeHandler } = await import('@foliwake/next/handler');

const routes = { GET, HEAD, POST };
const custom = createFoliwakeHandler({ hook: false, authorizePreview: () => true });
const results = [];
for (const { method, url, custom: useCustom } of JSON.parse(process.argv[2])) {
  const handler = useCustom ? custom[method] : routes[method];
  const response = await handler(new Request(url, { method }), { params: Promise.resolve({ path: [] }) });
  const text = method === 'HEAD' ? '' : await response.text();
  results.push({ status: response.status, cacheControl: response.headers.get('cache-control'), text });
}
process.stdout.write(JSON.stringify(results));
