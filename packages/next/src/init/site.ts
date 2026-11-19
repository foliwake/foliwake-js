// What init checks on the site before writing: its discovery document, and that its pages answer as plain/2
// (`X-Code-Release` on `/index.plain.html`). Prints what it found; never sends a credential.
import { fetchDiscovery, type FoliwakeDiscovery } from '@foliwake/server/discovery';
import { InitError } from './detect.js';

/** What init found on the site. */
export interface SiteFacts {
  url: string;
  site: string;
  discovery: FoliwakeDiscovery;
  /** `X-Foliwake-Blocks` of the root page, as sent, or null. */
  blocks: string | null;
  /** A note when the root page could not be checked (it may not exist). */
  note: string | null;
}

const NO_CODE_RELEASE =
  'answered without X-Code-Release: its engine does not serve plain/2 pages. Update the engine, then run init again.';

async function headIndex(url: string, doFetch: typeof fetch): Promise<Response> {
  const signal = AbortSignal.timeout(5000);
  return doFetch(`${url}/index.plain.html`, { method: 'HEAD', redirect: 'manual', signal });
}

async function rootPage(url: string, doFetch: typeof fetch): Promise<Pick<SiteFacts, 'blocks' | 'note'>> {
  let response: Response;
  try {
    response = await headIndex(url, doFetch);
  } catch {
    return { blocks: null, note: `${url}/index.plain.html did not answer; pages were not checked.` };
  }
  if (response.status !== 200) {
    return { blocks: null, note: `${url}/index.plain.html answered HTTP ${response.status}; pages were not checked.` };
  }
  if (!response.headers.get('x-code-release')) throw new InitError(`${url}/index.plain.html ${NO_CODE_RELEASE}`);
  return { blocks: response.headers.get('x-foliwake-blocks'), note: null };
}

/** Reads the discovery document and checks the root page. Throws (InitError, FoliwakeConfigError). */
export async function verifySite(url: string, doFetch: typeof fetch = globalThis.fetch): Promise<SiteFacts> {
  const discovery = await fetchDiscovery(url, { fetch: doFetch });
  const origin = discovery.live.url;
  return { url: origin, site: discovery.site, discovery, ...(await rootPage(origin, doFetch)) };
}

/** One line about the site, such as `site my-site, plain/2, blocks entry="scripts/blocks.js", …`. */
export function siteLine(facts: SiteFacts): string {
  const blocks = facts.blocks ? `blocks ${facts.blocks}` : 'no blocks module named (pages stay static)';
  return `${facts.url}: site ${facts.site}, plain/${facts.discovery.contracts.plain}, ${blocks}`;
}
