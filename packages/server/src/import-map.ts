// The import map of a prepared page's code release, for the app's document: blocks import the block-kit as the
// bare specifier `foliwake`, which resolves to `<codeBase>_foliwake/block-kit.js` of their own release. The map
// is scoped to the release's path on the app's code proxy, so pages of two releases resolve their own kits.
// `@foliwake/next` renders it with the page (`<FoliwakeServerPage>`); `@foliwake/client` adds the same map in
// the browser when it is missing.
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';

const KIT_SPECIFIER = 'foliwake';
const KIT_PATH = '_foliwake/block-kit.js';

/**
 * The text of a `<script type="importmap" data-foliwake-code="<codeBase>">` for the page, or null for a page
 * without a code release. `<` is escaped, so the text cannot end the script.
 */
export function pageImportMap(page: Pick<FoliwakePageData, 'codeBase'>): string | null {
  if (!page.codeBase) return null;
  const map = { scopes: { [page.codeBase]: { [KIT_SPECIFIER]: `${page.codeBase}${KIT_PATH}` } } };
  return JSON.stringify(map).replaceAll('<', '\\u003c');
}
