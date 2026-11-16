// The import map of a code release in an app's document, shared by @foliwake/server (rendered with the page) and
// @foliwake/client (added in the browser when missing), so both write the same map. Blocks import the block-kit
// as the bare specifier `foliwake`, which resolves to `<codeBase>_foliwake/block-kit.js` of their own release;
// the map is scoped to the release's path on the app's code proxy (`/foliwake-code/<cd>/`), so pages of two
// releases resolve their own kits. Browser-safe: no Node or DOM API. (The package's only runtime code.)

/** The specifier blocks import the block-kit with: the kit's npm name, so its types need no path mapping. */
export const KIT_SPECIFIER = '@foliwake/block-kit';
/**
 * The previous specifier, mapped to the same kit for one more minor version. Deprecated: import
 * `@foliwake/block-kit`; this key leaves the map in the next minor version.
 */
export const LEGACY_KIT_SPECIFIER = 'foliwake';
/** Every specifier the import map of a code release resolves to its kit. */
export const KIT_SPECIFIERS: readonly string[] = Object.freeze([KIT_SPECIFIER, LEGACY_KIT_SPECIFIER]);
/** Where a code release holds the block-kit, relative to its root. */
export const KIT_PATH = '_foliwake/block-kit.js';

/**
 * The text of the import map of a code release at `codeBase` (a same-origin path ending with "/"), or null
 * without one. `<` is escaped, so the text cannot end its `<script type="importmap">`.
 */
export function pageImportMap(page: { codeBase: string | null }): string | null {
  if (!page.codeBase) return null;
  const kit = `${page.codeBase}${KIT_PATH}`;
  const map = { scopes: { [page.codeBase]: Object.fromEntries(KIT_SPECIFIERS.map((specifier) => [specifier, kit])) } };
  return JSON.stringify(map).replaceAll('<', '\\u003c');
}
