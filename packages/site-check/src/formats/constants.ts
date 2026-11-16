// Constants of the site code formats, shared by every check of this package and by the Foliwake engine.

/** The version of the HTML the engine renders pages and blocks into. */
export const HTML_CONTRACT = 2;

/** The `authoring` values of front matter and of site.yaml. */
export const AUTHORING_DIALECTS: readonly string[] = Object.freeze(['blocks-v1', 'blocks-v2', 'blocks-v3']);

/** URL prefixes reserved by the platform: no page, index target or access rule may use them. */
export const RESERVED_PREFIXES: readonly string[] = Object.freeze([
  '/media',
  '/components',
  '/scripts',
  '/styles',
  '/_dev',
  '/code',
  '/_preview',
  // Inline reference tables and their images.
  '/references',
]);

/** Page field names (open front matter keys), also the index properties that read them (query.yaml). */
export const PAGE_FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
export const PAGE_FIELD_NAME_MAX_LENGTH = 32;

/** Allowed link schemes (lowercase, without the colon). */
export const ALLOWED_LINK_SCHEMES: readonly string[] = Object.freeze(['http', 'https', 'mailto', 'tel']);

/** Component (block) names in components/components.json. */
export const COMPONENT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Answer ids `{#id}` of a choices field: a letter, then letters, digits, `_` and `-`. */
export const OPTION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** A site id on a Foliwake server: 1–40 lowercase letters, digits and `-`, starting with a letter or digit. */
export const SITE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
