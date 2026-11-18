// Small rules the commands check or name before calling a server: branch review targets, branch URLs, the code
// token's credential name and the largest credential value.

const EXPECTED_VERSION_PATTERN = /^(sr_[0-9a-f]{32})(?:@(cd_[0-9a-f]{32,64}))?$/;

/** What a branch host names for `publish --expect`: the preview release and the code it was shown with. */
export function parseExpectedVersion(value: string): { preview: string; code?: string } | null {
  const match = EXPECTED_VERSION_PATTERN.exec(value);
  if (!match) return null;
  const [, preview, code] = match;
  if (preview === undefined) return null;
  if (code === undefined) return { preview };
  return { preview, code };
}

/** The URLs of a branch for people: its site branch host first, then its readable host, then its label host. */
export function describeBranchUrls({
  site,
  readable,
  label,
}: {
  site: string | null;
  readable: string | null;
  label: string;
}): string {
  const urls = readable ? `${readable} (also ${label})` : label;
  return site ? `${site} (also ${urls})` : urls;
}

/** The credential name of a site's code token: `<SITE>__CODE_TOKEN` (upper case, `-` as `_`). */
export function codeTokenName(siteId: string): string {
  return `${siteId.toUpperCase().replaceAll('-', '_')}__CODE_TOKEN`;
}

/** The largest credential value a server keeps, in bytes. */
export const MAX_CREDENTIAL_BYTES = 64 * 1024;
