// Hygiene rules for a packed tarball of this repository (tools/check-package-tarballs.mjs): only whitelisted
// files, no secrets, no paths of the machine that packed it, no internal hosts, no source maps, no references to
// the private history of moved code. Every rule returns the
// problems it found as messages; an empty list means the tarball may be published.

/** Paths inside `package/` that a published tarball may hold. */
const WHITELIST = [
  /^package\.json$/,
  /^(README|CHANGELOG)\.md$/,
  /^(LICENSE|NOTICE)$/,
  /^dist\/[\w./-]+\.(js|d\.ts)$/,
  /^schemas\/[\w.-]+\.schema\.json$/,
  // @foliwake/block-kit: the license of the vendored lit-html next to it.
  /^dist\/lit-html\.LICENSE$/,
  // create-foliwake: the starters it copies into a new project, and the vendored React they may get.
  /^starters\/[\w.-]+(\/[\w.-]+)+$/,
  /^vendor\/react(\.js|\.LICENSE\.txt)$/,
];

/** Files every published tarball must hold. */
const REQUIRED = ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE'];

/** File names that hold credentials or local configuration. */
const SECRET_FILES = /(^|\/)(\.env(\..*)?|\.npmrc|id_(rsa|ed25519|ecdsa)(\.pub)?|[^/]+\.(pem|key|p12|pfx|crt))$/;

/** Credentials in file contents: PEM private keys and the token formats of npm, GitHub and AWS. */
const SECRET_TEXT = [
  { name: 'a PEM private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'an npm token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'a GitHub token', pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{40,})\b/ },
  { name: 'an AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];

/** Paths of a developer machine or a build host. */
const LOCAL_PATHS = /(\/Users\/[\w.-]+\/|\/home\/[\w.-]+\/|\/private\/(var|tmp)\/|[A-Za-z]:\\\\?Users\\\\?)/;

/** Host names of the Foliwake deployments; only the public documentation and the apex domain may appear. */
const FOLIWAKE_HOST = /\b(?:[a-z0-9-]+\.)+foliwake\.dev\b/gi;
const PUBLIC_FOLIWAKE_HOSTS = new Set(['docs.foliwake.dev']);

/** IPv4 literals; loopback, unspecified and the documentation ranges (RFC 5737) are allowed. */
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const PUBLIC_IPV4 = /^(127\.|0\.0\.0\.0$|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/;

/**
 * Names that must never appear in a published file (private projects, customers). The list is not kept in this
 * public repository: CI passes it in FOLIWAKE_PRIVATE_NAMES (comma-separated, case-insensitive).
 */
export function privateNames(env = process.env) {
  const list = env.FOLIWAKE_PRIVATE_NAMES ?? '';
  return list
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * References to the private history of code moved from the engine: its planning documents, review ids, dated
 * owner decisions, agent names and pull request numbers. Comments of published code cite public contracts only.
 */
const INTERNAL_REFERENCES = [
  { name: 'a private planning document', pattern: /\bdocs\/(plan|phases|contracts|briefs?)\//i },
  { name: 'a dated owner decision', pattern: /\bowner(?: [a-z]+)?,? 20\d\d-\d\d/i },
  { name: 'a review id', pattern: /\b(RR|P\d+-R)-?\d{2}\b/ },
  { name: 'an agent name', pattern: /\b(Codex|Fable)\b/ },
  { name: 'a pull request number', pattern: /\b(?:PR|pull request|review of|issue)\s*#\d+/i },
  { name: 'a pull request of another repository', pattern: /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+ #\d+\b/ },
  { name: 'a plan number', pattern: /\b(?:plan|brief) \d+\b/i },
];

/** Source maps: none are shipped, so no module may point at one (bundlers and devtools warn about it). */
const SOURCE_MAP_URL = /^\/\/# sourceMappingURL=/m;

/** Files outside the whitelist and required files that are missing. */
export function fileListProblems(paths) {
  const outside = paths.filter((p) => !WHITELIST.some((rule) => rule.test(p)));
  const missing = REQUIRED.filter((p) => !paths.includes(p));
  return [
    ...outside.map((p) => `${p} is outside the published whitelist`),
    ...missing.map((p) => `${p} is missing`),
  ];
}

/** Problems in one file: its name and its contents. */
export function fileProblems({ path, text }, names = privateNames()) {
  const problems = [];
  if (SECRET_FILES.test(path)) problems.push(`${path} looks like a credentials file`);
  if (path.endsWith('.map')) problems.push(`${path} is a source map`);
  for (const { name, pattern } of SECRET_TEXT) if (pattern.test(text)) problems.push(`${path} holds ${name}`);
  const local = text.match(LOCAL_PATHS);
  if (local) problems.push(`${path} holds the local path ${local[0]}`);
  for (const host of internalHosts(text)) problems.push(`${path} names the internal host ${host}`);
  if (path.endsWith('.js') && SOURCE_MAP_URL.test(text)) problems.push(`${path} has a sourceMappingURL`);
  for (const { name, pattern } of INTERNAL_REFERENCES) {
    const found = text.match(pattern);
    if (found) problems.push(`${path} cites ${name} (${found[0]})`);
  }
  const lowered = text.toLowerCase();
  const named = names.filter((name) => lowered.includes(name));
  if (named.length > 0) problems.push(`${path} names a private project (${named.length} private name(s))`);
  return problems;
}

function internalHosts(text) {
  const hosts = (text.match(FOLIWAKE_HOST) ?? []).filter((h) => !PUBLIC_FOLIWAKE_HOSTS.has(h.toLowerCase()));
  const addresses = (text.match(IPV4) ?? []).filter((ip) => !PUBLIC_IPV4.test(ip));
  return [...new Set([...hosts, ...addresses])];
}

/** Every problem of a tarball, given its files as `{ path, text }` with paths relative to `package/`. */
export function tarballProblems(files) {
  return [...fileListProblems(files.map((f) => f.path)), ...files.flatMap((file) => fileProblems(file))];
}
