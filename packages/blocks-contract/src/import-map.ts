// The import map of a code release in an app's document, shared by @foliwake/server (rendered with the page) and
// @foliwake/client (added in the browser when missing), so both write the same map. Blocks import the block-kit
// as the bare specifier `foliwake`, which resolves to `<codeBase>_foliwake/block-kit.js` of their own release;
// the map is scoped to the release's path on the app's code proxy (`/foliwake-code/<cd>/`), so pages of two
// releases resolve their own kits. Browser-safe: no Node or DOM API. (The package's only runtime code.)

/** The bare specifier blocks import the block-kit with. */
export const KIT_SPECIFIER = 'foliwake';
/** Where a code release holds the block-kit, relative to its root. */
export const KIT_PATH = '_foliwake/block-kit.js';

/**
 * The text of the import map of a code release at `codeBase` (a same-origin path ending with "/"), or null
 * without one. `<` is escaped, so the text cannot end its `<script type="importmap">`.
 */
export function pageImportMap(page: { codeBase: string | null }): string | null {
  if (!page.codeBase) return null;
  const map = { scopes: { [page.codeBase]: { [KIT_SPECIFIER]: `${page.codeBase}${KIT_PATH}` } } };
  return JSON.stringify(map).replaceAll('<', '\\u003c');
}
