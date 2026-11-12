// The import map of a page's code release in an app's document: blocks import the block-kit as the bare
// specifier `foliwake`, which resolves to `<codeBase>_foliwake/block-kit.js` of their own release. The map is
// scoped to the release's path (`/foliwake-code/<cd>/`), so pages of two releases resolve their own kits.
// `@foliwake/next` renders it with the page on the server (FoliwakeServerPage); `ensureImportMap` adds it in
// the browser when it is not there yet (a fallback: a map added after the document's first module load is
// honoured only by browsers with multiple import maps, Chrome 133+).
//
// A map counts as there only when the browser has read it: one the HTML parser saw (in the document when this
// module was evaluated or when the document was parsed, as a server-rendered page's map is), or one added here.
// A map element that a framework renders on the client (React inserts script elements inert, so on a client
// navigation its map is never read) does not count. Under a CSP with nonces, pass the page's nonce: the map
// is inline, and one without the nonce is blocked.
import { pageImportMap } from '@foliwake/blocks-contract/import-map';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';

export { pageImportMap };

// The maps the browser has read: those in the document when this module was evaluated or the parser finished,
// and those added here.
const read = new WeakSet<Element>();
const parsed = (doc: Document) => {
  for (const script of doc.querySelectorAll('script[type="importmap"]')) read.add(script);
};
if (typeof document !== 'undefined') {
  parsed(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => parsed(document), { once: true });
}

/**
 * Adds the page's import map to the document's head unless a map for its code base that the browser read is
 * there. `nonce`: the CSP nonce of the document (strategy `nonce`), set on the added map.
 */
export function ensureImportMap(doc: Document, page: Pick<FoliwakePageData, 'codeBase'>, nonce?: string): void {
  const text = pageImportMap(page);
  if (text === null || !page.codeBase) return;
  const present = [...doc.querySelectorAll('script[type="importmap"][data-foliwake-code]')].some((s) => read.has(s) && (s as HTMLElement).dataset.foliwakeCode === page.codeBase);
  if (present) return;
  const script = doc.createElement('script');
  script.type = 'importmap';
  script.dataset.foliwakeCode = page.codeBase;
  if (nonce) script.nonce = nonce;
  script.textContent = text;
  doc.head.append(script);
  read.add(script);
}
