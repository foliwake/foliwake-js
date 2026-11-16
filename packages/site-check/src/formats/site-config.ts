// Site settings: `site.yaml` at the root of the site code, captured into the code release, checked when the
// release is prepared, never served.
//
//   version: 1
//   authoring: blocks-v3
//
// `authoring` is the default dialect of the site's pages; front matter overrides it per page.
// No file, or no `authoring` key, means no default. Pure: no store, no clock, no environment.
import { AUTHORING_DIALECTS } from './constants.js';
import {
  type FileProblem,
  type ParsedYaml,
  decodeUtf8,
  describeNode,
  fileProblem,
  isMap,
  isPair,
  isScalar,
  parseYaml,
  problemRecorder,
  yamlProblems,
} from './yaml.js';

/** The release-root file name. */
export const SITE_FILE = 'site.yaml';

export const SITE_CONFIG_LIMITS = Object.freeze({ fileBytes: 64 * 1024 });

export interface SiteConfig {
  /** The default dialect; null when the file has no `authoring` key. */
  authoring: string | null;
}

export type SiteConfigResult =
  { config: SiteConfig; problems?: undefined } | { config?: undefined; problems: FileProblem[] };

const ROOT_KEYS = new Set(['version', 'authoring']);

/** Parses and checks the bytes of `site.yaml`. Every problem is reported; a config only when there is none. */
export function parseSiteConfig(bytes: Uint8Array): SiteConfigResult {
  if (bytes.byteLength > SITE_CONFIG_LIMITS.fileBytes) {
    return {
      problems: [fileProblem(`the file has ${bytes.byteLength} bytes; at most ${SITE_CONFIG_LIMITS.fileBytes}`)],
    };
  }
  const text = decodeUtf8(bytes);
  if (text === null) return { problems: [fileProblem('the file is not valid UTF-8')] };
  const parsed: ParsedYaml = parseYaml(text, { line: 1, column: 1 });
  if (parsed.issues.length > 0) return { problems: yamlProblems(parsed) };

  const problems: FileProblem[] = [];
  const at = problemRecorder(parsed, problems);
  const root = parsed.contents;
  if (!isMap(root)) {
    at(root, null, `the file must be a mapping with \`version: 1\`, found ${describeNode(root)}`);
    return { problems };
  }
  let version: unknown;
  let authoring: string | null = null;
  for (const pair of root.items) {
    if (!isPair(pair)) continue;
    const key = isScalar(pair.key) ? pair.key.value : undefined;
    const value = isScalar(pair.value) ? pair.value.value : undefined;
    if (typeof key !== 'string' || !ROOT_KEYS.has(key)) {
      at(pair.key, null, `unknown key ${JSON.stringify(key ?? null)}; allowed: ${[...ROOT_KEYS].join(', ')}`);
    } else if (key === 'version') {
      version = value;
    } else if (typeof value === 'string' && AUTHORING_DIALECTS.includes(value)) {
      authoring = value;
    } else {
      const allowed = AUTHORING_DIALECTS.join(', ');
      at(pair.value ?? pair.key, 'authoring', `unknown dialect ${JSON.stringify(value ?? null)}; allowed: ${allowed}`);
    }
  }
  if (version !== 1) at(root, 'version', '`version: 1` is required');
  return problems.length > 0 ? { problems } : { config: { authoring } };
}
