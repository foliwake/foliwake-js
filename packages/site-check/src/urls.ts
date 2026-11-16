// Link URL safety: which link destinations a page (and a reference table) may use.

import { normalizeUri } from 'micromark-util-sanitize-uri';
import { ALLOWED_LINK_SCHEMES } from './formats/constants.js';

// eslint-disable-next-line no-control-regex
const ASCII_WHITESPACE_AND_CONTROL = /[\u0000- \u007f]/g;
// eslint-disable-next-line no-control-regex
const EDGE_C0_AND_SPACE = /^[\u0000- ]+|[\u0000- ]+$/g;

/** Path part of a path-absolute link (no query, no fragment). */
export function linkPathname(url: string): string {
  return url.replace(/[?#].*$/s, '');
}

/** Result of checkLinkUrl. `pathname` is set for path-absolute links. */
export type LinkCheck =
  { ok: true; href: string; pathname: string | null } | { ok: false; message: string; fix: string };

/**
 * Checks a Markdown link destination. `url` is the destination after the
 * parser decoded character references and escapes.
 *
 * @returns {{ok: true, href: string, pathname: string|null} | {ok: false, message: string, fix: string}}
 *   `pathname` is set for path-absolute links (used for CONTENT_LINK_UNKNOWN_PATH).
 */
export function checkLinkUrl(url: string): LinkCheck {
  // What a browser would use: tab/LF/CR removed anywhere, C0 and space trimmed.
  const emitted = url.replace(/[\t\n\r]/g, '').replace(EDGE_C0_AND_SPACE, '');
  // What decides the scheme: every ASCII whitespace/control character removed;
  // backslashes count as slashes, as browsers treat them in http(s) URLs.
  const probe = url.replace(ASCII_WHITESPACE_AND_CONTROL, '').replace(/\\/g, '/');

  if (probe.startsWith('//')) {
    return {
      ok: false,
      message: `Protocol-relative link ${JSON.stringify(url)} is not allowed.`,
      fix: `Write the scheme explicitly: \`https:${probe}\`.`,
    };
  }

  const match = /^([^:/?#]*):/.exec(probe);
  if (!match) {
    return { ok: true, href: normalizeUri(emitted), pathname: probe.startsWith('/') ? linkPathname(emitted) : null };
  }

  const scheme = match[1].toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme) || !ALLOWED_LINK_SCHEMES.includes(scheme)) {
    return {
      ok: false,
      message: `Link scheme "${match[1]}:" is not allowed.`,
      fix: `Use a relative path or one of: ${ALLOWED_LINK_SCHEMES.map((s) => `${s}:`).join(', ')}.`,
    };
  }
  if (emitted.slice(0, scheme.length + 1).toLowerCase() !== `${scheme}:`) {
    return {
      ok: false,
      message: `Link scheme in ${JSON.stringify(url)} contains whitespace or control characters.`,
      fix: `Write the scheme without spaces: \`${scheme}:\`.`,
    };
  }
  return { ok: true, href: normalizeUri(`${scheme}:${emitted.slice(scheme.length + 1)}`), pathname: null };
}
