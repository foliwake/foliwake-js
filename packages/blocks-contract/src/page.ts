// Page types shared by @foliwake/server (which produces them) and @foliwake/client / @foliwake/react (which show
// them), so the browser packages' declarations never import the server package.
import type { BlockMode, ChannelName } from './index.js';

export type { ChannelName } from './index.js';

/** A code release id (`cd_` + 32–64 hex), or `local` from `foliwake dev`. */
export type CodeReleaseId = `cd_${string}` | 'local';

/** What the origin answered for `<path>.plain.html`: the only thing cached (design §6.5). */
export interface PageEnvelope {
  site: string;
  channel: ChannelName;
  path: string;
  /** The body as served. */
  html: string;
  /** `X-Code-Release` (plain/2); null from a plain/1 origin → the body is shown static. */
  codeRelease: CodeReleaseId | null;
  /** `X-Html-Contract`. */
  htmlContract: string;
  /** `Content-Language`. */
  lang: string | null;
  /** `X-Page-Id`. */
  pageId: string | null;
  etag: string | null;
  /** `X-Site-Generation`. */
  generation: string | null;
}

/** What a client component receives: serialisable, prepared per request. */
export interface FoliwakePageData {
  /**
   * `${site}|${channel}|${path}|${etag}|${codeRelease}|${mode}|${digest}`: the React key of the body (design §6.2).
   * `digest` is a SHA-256 prefix of the final prepared HTML and the mount-defining settings (blocks URL, contract,
   * HTML contract, language), so any change of what is mounted gives a new identity and nothing else does.
   */
  identity: string;
  site: string;
  channel: ChannelName;
  path: string;
  mode: BlockMode;
  /** Prepared: checked, rewritten, transformed, checked again. */
  html: string;
  codeRelease: CodeReleaseId | null;
  htmlContract: string;
  lang: string | null;
  /** Distinct `data-component` names in the body, sorted (CSS preload). */
  blocks: string[];
  /** Same-origin URL of the blocks module, or null when the body is to stay static. */
  blocksUrl: string | null;
  /** Same-origin URL prefix of the code release (`<proxies.code>[/preview]/<cd>/`), or null. */
  codeBase: string | null;
  /** `foliwake-blocks/<major>` the app expects, and the event prefix it expects. */
  contract: { major: number; eventPrefix: string };
  /** Same-origin preload hints of the blocks on this page (filled by the server read; empty from preparePage). */
  preload: PreloadHint[];
}

/** `<link rel="modulepreload" href>` or `<link rel="preload" as="style" href>`, href on the app's code proxy. */
export interface PreloadHint {
  rel: 'modulepreload' | 'preload';
  href: string;
  as?: 'style';
}

/** The settings a browser may know (`clientSettings(config)`); nothing else is serialised to it. */
export interface ClientSettings {
  site: string;
  proxies: { code: string; media: string; pages: string | null };
  blocks: { contract: string; eventPrefix: string };
}

export interface QueryIndex<Row = Record<string, string>> {
  total: number;
  offset: number;
  limit: number;
  columns: string[];
  data: Row[];
}
