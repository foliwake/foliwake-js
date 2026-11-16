// A static server for the browser harnesses (react-browser, client-browser): the built harness from `dist`,
// plus foliwake-blocks/2 modules served like an app's code proxy (`/foliwake-code/<cd>/scripts/blocks.js`).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const CDS = { a: `cd_${'a1'.repeat(16)}`, b: `cd_${'b2'.repeat(16)}`, slow: `cd_${'c3'.repeat(16)}`, major3: `cd_${'d4'.repeat(16)}`, sync: `cd_${'e5'.repeat(16)}` };

// A foliwake-blocks/2 module: adds one button per root, emits `demo:answer` with host.saved(), counts mounts,
// records the host's shell and the release of the block-kit it imported as `foliwake` (the page's import map
// resolves it to its own release), and adds the block's stylesheet to <head> unless a link for it is there already.
export const blocksModule = (cd, major = 2, { syncEvent = false } = {}) => `
import { release as kitRelease } from 'foliwake';
window.__log ??= [];
export const BLOCKS_CONTRACT = { major: ${major}, minor: 0, eventPrefix: 'demo' };
export function mountBlocks(container, host) {
  window.__log.push(['mount', '${cd}', container.querySelectorAll('button.fw').length, container.isConnected, host.shell, kitRelease]);
  if (!document.head.querySelector('link[data-component-css="quiz"][data-code-release="${cd}"]')) { // the loader reuses a link in <head>
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('../components/quiz/quiz.css', import.meta.url).href;
    link.dataset.componentCss = 'quiz'; link.dataset.codeRelease = '${cd}';
    document.head.append(link);
  }
  const roots = [...container.querySelectorAll('[data-component]')];
  for (const root of roots) {
    const button = document.createElement('button');
    button.className = 'fw'; button.textContent = host.labels?.check ?? 'check';
    button.onclick = () => root.dispatchEvent(new CustomEvent('demo:answer', { bubbles: true, detail: { key: 'k1', block: 'quiz', selected: ['a'], correct: true, graded: 'local', saved: host.saved('k1') } }));
    root.append(button);
  }
  ${syncEvent ? "for (const root of roots) root.dispatchEvent(new CustomEvent('demo:ready', { bubbles: true, detail: { key: 'k1', block: 'quiz' } })); // during mountBlocks" : ''}
  let disposed = false;
  return { ready: Promise.resolve(roots.map(() => ({ name: 'quiz', key: 'k1', status: 'ready' }))), dispose() { if (disposed) return; disposed = true; window.__log.push(['dispose', '${cd}']); } };
}`;

/** Serves `dist` and the blocks modules; the `slow` release answers after 1.5 s. */
export async function startBlocksServer(dist) {
  const code = {
    // Each release's block-kit says which release it is.
    ...Object.fromEntries(Object.values(CDS).map((cd) => [`/foliwake-code/${cd}/_foliwake/block-kit.js`, `export const release = '${cd}';`])),
    [`/foliwake-code/${CDS.a}/scripts/blocks.js`]: blocksModule(CDS.a),
    [`/foliwake-code/${CDS.b}/scripts/blocks.js`]: blocksModule(CDS.b),
    [`/foliwake-code/${CDS.slow}/scripts/blocks.js`]: blocksModule(CDS.slow),
    [`/foliwake-code/${CDS.major3}/scripts/blocks.js`]: blocksModule(CDS.major3, 3),
    [`/foliwake-code/${CDS.sync}/scripts/blocks.js`]: blocksModule(CDS.sync, 2, { syncEvent: true }),
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (code[url.pathname]) {
      if (url.pathname.includes(CDS.slow)) await new Promise((r) => setTimeout(r, 1500));
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      return res.end(code[url.pathname]);
    }
    if (url.pathname.endsWith('.css')) { res.writeHead(200, { 'content-type': 'text/css' }); return res.end('.fw{color:green}'); }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    try {
      const body = await readFile(path.join(dist, file));
      res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
