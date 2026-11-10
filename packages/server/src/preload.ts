// Preload hints for a page's blocks (owner addition 2026-11-10): the browser should fetch the blocks module,
// the modules of the blocks actually on the page, their static imports (block-kit, the shared React chunk)
// and their stylesheets in parallel with the HTML, not as an import waterfall.
//
// Everything comes from the page's own code release, read on the server through the origin client:
//  - `components/components.json` says which blocks have a .js and a .css;
//  - each module's static relative imports are followed (`import … from "./x.js"`, `import "./x.js"`,
//    `export … from "./x.js"`; dynamic import() is not followed), depth ≤ 4, at most 48 modules.
// A code release is immutable, so results are kept in memory per (channel, code release, file). Hints are an
// optimisation: a failed read gives fewer hints, never an error. Every href is a same-origin proxy URL
// (`<proxies.code>[/preview]/<cd>/<path>`) that the code proxy's allow-list accepts, so CSP 'self' covers it.
import type { FoliwakePageData, PreloadHint } from '@foliwake/blocks-contract/page';
import { appOf, type FoliwakeAppConfig } from './config.js';
import { CODE_ROOTS, CODE_SEGMENT } from './constants.js';
import type { OriginClient } from './origin.js';
import { readLimited } from './stream.js';

export type { PreloadHint } from '@foliwake/blocks-contract/page';

const MAX_MODULES = 48;
const MAX_DEPTH = 4;
const FILE_LIMIT = 1024 * 1024;
const CACHE_LIMIT = 2048;
const STATIC_IMPORT = /(?:^|[;\s}])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["'](\.{1,2}\/[^"'\s]+)["']/g;

const files = new Map<string, Promise<string | null>>();

function remember(key: string, value: Promise<string | null>): Promise<string | null> {
  if (files.size >= CACHE_LIMIT) files.delete(files.keys().next().value!);
  files.set(key, value);
  return value;
}

/** A path inside the code release the proxy would serve, or null. */
export function codePath(relative: string): string | null {
  const segments = relative.split('/');
  if (segments.length < 2 || segments.length > 9 || !CODE_ROOTS.includes(segments[0]!)) return null;
  if (segments.some((s) => !CODE_SEGMENT.test(s) || s === '..' || s === '.')) return null;
  return relative;
}

/** Resolves `specifier` against the module at `from` (both inside the release), or null when it leaves it. */
export function resolveInRelease(from: string, specifier: string): string | null {
  const url = new URL(specifier, `https://release.invalid/${from}`);
  if (url.origin !== 'https://release.invalid' || url.search || url.hash) return null;
  return codePath(url.pathname.slice(1));
}

/** The relative static import specifiers of an ES module's text. */
export function staticImports(source: string): string[] {
  const out = new Set<string>();
  for (const match of source.matchAll(STATIC_IMPORT)) out.add(match[1]!);
  return [...out];
}

async function readText(client: OriginClient, channel: FoliwakePageData['channel'], cd: string, file: string): Promise<string | null> {
  const key = `${channel}|${cd}|${file}`;
  const known = files.get(key);
  if (known) return known;
  const read = (async () => {
    try {
      const response = await client.request(channel, `/code/${cd}/${file}`);
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => {});
        return null;
      }
      return new TextDecoder().decode(await readLimited(response, FILE_LIMIT));
    } catch {
      return null;
    }
  })();
  // A failure is not remembered (the next request tries again); 'local' code changes, so it is never kept.
  void read.then((text) => {
    if (text === null || cd === 'local') files.delete(key);
  });
  return remember(key, read);
}

/** Hints for a prepared page: modulepreload for its modules, preload as=style for its block stylesheets. */
export async function preloadHints(config: FoliwakeAppConfig, client: OriginClient, page: FoliwakePageData): Promise<PreloadHint[]> {
  const app = appOf(config);
  if (!page.codeBase || !page.codeRelease || !app.blocks.entry) return [];
  const cd = page.codeRelease;
  const descriptorText = await readText(client, page.channel, cd, 'components/components.json');
  let declared: Record<string, { js?: boolean; css?: boolean }> = {};
  try {
    const parsed = descriptorText ? JSON.parse(descriptorText) : null;
    if (parsed && typeof parsed.components === 'object' && parsed.components !== null) declared = parsed.components;
  } catch {
    declared = {};
  }
  const roots = [app.blocks.entry];
  const styles: string[] = [];
  for (const name of page.blocks) {
    const entry = declared[name];
    if (!entry) continue;
    if (entry.js === true) roots.push(`components/${name}/${name}.js`);
    if (entry.css === true) styles.push(`components/${name}/${name}.css`);
  }
  const modules = new Set<string>();
  let frontier = roots.map(codePath).filter((p): p is string => p !== null);
  for (let depth = 0; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
    const fresh = frontier.filter((p) => !modules.has(p)).slice(0, MAX_MODULES - modules.size);
    for (const p of fresh) modules.add(p);
    if (depth === MAX_DEPTH || modules.size >= MAX_MODULES) break;
    const texts = await Promise.all(fresh.map((p) => readText(client, page.channel, cd, p)));
    const next = new Set<string>();
    texts.forEach((text, i) => {
      if (!text) return;
      for (const specifier of staticImports(text)) {
        const resolved = resolveInRelease(fresh[i]!, specifier);
        if (resolved && resolved.endsWith('.js') && !modules.has(resolved)) next.add(resolved);
      }
    });
    frontier = [...next];
  }
  return [
    ...[...modules].map((p): PreloadHint => ({ rel: 'modulepreload', href: `${page.codeBase}${p}` })),
    ...styles.map((p): PreloadHint => ({ rel: 'preload', as: 'style', href: `${page.codeBase}${p}` })),
  ];
}

/** Forgets every remembered code file (tests). */
export function clearPreloadCache(): void {
  files.clear();
}
