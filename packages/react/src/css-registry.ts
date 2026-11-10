// Block stylesheet ownership per code release (design §6.2 invariant 6): a document-level count of mounts
// per code release. The release's loader-added links (`link[data-component-css][data-code-release]` in
// <head>) are removed when its last mount disposes. Links this package renders itself are removed by React.

const counts = new WeakMap<Document, Map<string, number>>();

function table(doc: Document): Map<string, number> {
  let map = counts.get(doc);
  if (!map) counts.set(doc, (map = new Map()));
  return map;
}

/** Counts a mount of `codeRelease`; returns the release function (idempotent). */
export function acquireCss(doc: Document, codeRelease: string): () => void {
  const map = table(doc);
  map.set(codeRelease, (map.get(codeRelease) ?? 0) + 1);
  if (map.size > 1 && isDevelopment()) {
    console.warn(`[foliwake] blocks of ${map.size} code releases are mounted at once (${[...map.keys()].join(', ')}); their stylesheets may conflict. Scripts are isolated, styles are not.`);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (map.get(codeRelease) ?? 1) - 1;
    if (left > 0) {
      map.set(codeRelease, left);
      return;
    }
    map.delete(codeRelease);
    for (const link of doc.head.querySelectorAll('link[data-component-css][data-code-release]')) {
      if ((link as HTMLElement).dataset.codeRelease === codeRelease) link.remove();
    }
  };
}

/** Mounts per code release in this document (tests, diagnostics). */
export function cssMounts(doc: Document): Record<string, number> {
  return Object.fromEntries(table(doc));
}

function isDevelopment(): boolean {
  try {
    return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV === 'development';
  } catch {
    return false;
  }
}
