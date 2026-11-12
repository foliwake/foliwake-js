// Content-Security-Policy for an app that embeds Foliwake pages (design §5; decision in §12, spike of
// 2026-11-10). Blocks load from the app's own origin (the code proxy), so no Foliwake host is ever named in
// `script-src`, and there is no 'strict-dynamic'.
//
// 'self-inline' (the decided strategy, A): `script-src 'self' 'unsafe-inline'`. Works with Cache Components /
// PPR static shells; measured with zero violations on Next 16.2.12 and 16.4.3.
// 'nonce' (B, experimental): nonce + the hash of React's constant inline timing script. Measured clean
// on Next 16.2.12 only for hard loads; broken on 16.4.3 (un-nonced Turbopack bootstrap). Not recommended.

/** React DOM 19.2's inline `requestAnimationFrame(function(){$RT=performance.now()});` in PPR static shells. */
export const REACT_SHELL_SCRIPT = 'requestAnimationFrame(function(){$RT=performance.now()});';
/** The CSP hash source of `REACT_SHELL_SCRIPT` (used by the `nonce` strategy). */
export const REACT_SHELL_SCRIPT_HASH = "'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs='";

/** Options of `foliwakeCsp`. */
export interface CspOptions {
  /** `self-inline` (recommended; works with partial prerendering) or `nonce` (experimental, not recommended). */
  strategy: 'self-inline' | 'nonce';
  /** Required with 'nonce'. */
  nonce?: string;
  /**
   * The media host whose pictures pages show: `app.media.base` (live pictures through a transforming host),
   * or the site's own CDN when the site resizes images on one (`media.resize: "cdn"`, whose `cdnBase` is in
   * every live `srcset`). An https address; only its origin (scheme and host) is added to `img-src`.
   */
  mediaBase?: string | null;
  /** Development: adds 'unsafe-eval' (React's debugging) and websocket connections for HMR. */
  dev?: boolean;
  /** Where browsers report violations (`report-uri`). */
  reportUri?: string;
  /** More sources per directive, e.g. { 'connect-src': ['https://api.example.org'] }. */
  extra?: Partial<Record<string, string[]>>;
}

const SOURCE = /^(?:'[a-z0-9-]+(?:-[A-Za-z0-9+/=_-]+)?'|[a-z][a-z0-9+.-]*:|https:\/\/[A-Za-z0-9.*-]+(?::\d+)?(?:\/[^\s;,]*)?|wss?:\/\/[A-Za-z0-9.*-]+(?::\d+)?)$/;
const DIRECTIVE = /^[a-z-]+$/;
const NONCE = /^[A-Za-z0-9+/=_-]{16,128}$/;

// The origin of an https media host; never a scheme, wildcard or credentials in the policy.
function mediaOrigin(value: string): string {
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    // refused below
  }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.hostname.includes('*')) {
    throw new TypeError('foliwakeCsp: mediaBase must be an https:// address such as https://media.example.org.');
  }
  return url.origin;
}

/** The policy as one header value. */
export function foliwakeCsp(opts: CspOptions): string {
  const d = new Map<string, string[]>();
  const add = (name: string, ...values: string[]) => d.set(name, [...(d.get(name) ?? []), ...values]);
  add('default-src', "'self'");
  if (opts.strategy === 'nonce') {
    if (!opts.nonce || !NONCE.test(opts.nonce)) throw new TypeError('foliwakeCsp: a nonce of 16–128 base64 characters is required with strategy "nonce".');
    add('script-src', "'self'", `'nonce-${opts.nonce}'`, REACT_SHELL_SCRIPT_HASH);
    add('style-src', "'self'", `'nonce-${opts.nonce}'`);
    add('style-src-attr', "'unsafe-inline'");
  } else if (opts.strategy === 'self-inline') {
    add('script-src', "'self'", "'unsafe-inline'");
    add('style-src', "'self'", "'unsafe-inline'");
  } else {
    throw new TypeError('foliwakeCsp: strategy must be "self-inline" or "nonce".');
  }
  if (opts.dev) add('script-src', "'unsafe-eval'");
  add('img-src', "'self'", 'data:', 'blob:');
  if (opts.mediaBase) add('img-src', mediaOrigin(opts.mediaBase));
  add('font-src', "'self'");
  add('connect-src', "'self'");
  if (opts.dev) add('connect-src', 'ws:', 'wss:');
  add('object-src', "'none'");
  add('base-uri', "'self'");
  add('form-action', "'self'");
  add('frame-ancestors', "'none'");
  for (const [name, values] of Object.entries(opts.extra ?? {})) {
    if (!DIRECTIVE.test(name)) throw new TypeError(`foliwakeCsp: invalid directive ${JSON.stringify(name)}`);
    for (const value of values ?? []) {
      if (!SOURCE.test(value)) throw new TypeError(`foliwakeCsp: invalid source ${JSON.stringify(value)} for ${name}`);
      add(name, value);
    }
  }
  const parts = [...d].map(([name, values]) => `${name} ${[...new Set(values)].join(' ')}`);
  if (opts.reportUri) {
    if (!/^\/[A-Za-z0-9/_-]*$/.test(opts.reportUri)) throw new TypeError('foliwakeCsp: reportUri must be an app path such as /csp-report');
    parts.push(`report-uri ${opts.reportUri}`);
  }
  return parts.join('; ');
}
