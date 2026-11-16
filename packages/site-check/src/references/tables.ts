// Inline reference tables: one file `references/<kind>.json` of site code declares the kind `<kind>` and holds
// its table (format `foliwake-references/1`). A page writes `` `kind:value` `` or `[text](kind:value)`; the
// engine resolves it against the table of the code the page is compiled with and renders real HTML. Nothing
// here knows any site: a kind exists because its file does.
//
// Read by siteCodeOf() (site-code.ts) from a working folder and from the captured files of a code release
// alike, so a release holds exactly the tables the local check accepted; an invalid table refuses the release
// (REFERENCES_TABLE_INVALID, REFERENCES_IMAGE_MISSING).

import { createHash } from 'node:crypto';
import path from 'node:path';
import { canonicalJson } from '../blocks/pack.js';
import { ALLOWED_LINK_SCHEMES, PAGE_FIELD_NAME_PATTERN } from '../formats/constants.js';
import { checkLinkUrl } from '../urls.js';
import { type ProblemText, TABLE_PROBLEMS } from './messages.js';

export const REFERENCES_SCHEMA = 'foliwake-references/1';
/** The code root of reference tables and their images. */
export const REFERENCES_ROOT = 'references';

/** Limits of a site's tables (a violation refuses the code release). */
export const REFERENCE_LIMITS = Object.freeze({
  kinds: 10,
  fileBytes: 1024 * 1024,
  entriesPerSet: 5000,
  valueLength: 64,
  textLength: 200,
  patternLength: 256,
  imageSide: 10000,
});

/** A kind name (the file name `references/<kind>.json`); also the `kind:` of an inline reference. */
export const REFERENCE_KIND_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const SET_NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
/** The one set of a table without `by`. */
export const DEFAULT_SET = '*';
const LANG_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/;
const IMAGE_EXTENSIONS: readonly string[] = Object.freeze(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const TABLE_KEYS: readonly string[] = Object.freeze(['schema', 'render', 'pattern', 'by', 'sets']);
const ENTRY_KEYS: Readonly<Record<ReferenceRender, readonly string[]>> = Object.freeze({
  image: ['image', 'name', 'width', 'height'],
  term: ['label', 'title', 'href'],
});
const MAX_ISSUES_PER_FILE = 20;

export type ReferenceRender = 'image' | 'term';
/** Text by language tag. */
export type LangText = Readonly<Record<string, string>>;

/**
 * One value of a set. `image` kinds: `image` (a path inside references/, or an https: URL), `name`,
 * `width`, `height`. `term` kinds: `label`, `title`, `href`.
 */
export interface ReferenceEntry {
  image?: string;
  name?: LangText;
  width?: number;
  height?: number;
  label?: LangText;
  title?: LangText;
  href?: string;
}

/** A valid table of one kind. */
export interface ReferenceTable {
  kind: string;
  file: string;
  render: ReferenceRender;
  pattern: RegExp;
  /** the page field that selects the set; null: the one set DEFAULT_SET */
  by: string | null;
  sets: ReadonlyMap<string, ReadonlyMap<string, ReferenceEntry>>;
  /** sha256 (hex) of the table's canonical JSON: equal signatures resolve equally */
  signature: string;
}

export type ReferenceTables = ReadonlyMap<string, ReferenceTable>;

/** A problem of a table, naming its file and a JSON pointer into it. */
export interface ReferenceIssue {
  code: 'REFERENCES_TABLE_INVALID' | 'REFERENCES_IMAGE_MISSING';
  pointer: string;
  message: string;
  fix: string | null;
  file: string;
}

/** Read access the tables need: the files of `references/` and whether a release file exists. */
export interface ReferenceSource {
  /** paths of the files directly under references/ (`references/<name>`) */
  referenceFiles(): Promise<string[]>;
  isFile(relative: string): Promise<boolean>;
  readBytes(relative: string): Promise<Uint8Array>;
}

/** The release path of a table image written as a path inside references/; null for an https: URL. */
export function referenceImagePath(image: string): string | null {
  return /^https:/i.test(image) ? null : `${REFERENCES_ROOT}/${image}`;
}

/**
 * Reads every `references/<kind>.json` of a code tree. `tables` is null when the site declares no
 * kind; an invalid file is left out of `tables` and reported in `issues`.
 */
export async function readReferenceTables(
  source: ReferenceSource,
): Promise<{ tables: ReferenceTables | null; issues: ReferenceIssue[] }> {
  const files = (await source.referenceFiles()).filter((file) => file.endsWith('.json')).sort();
  const issues: ReferenceIssue[] = [];
  const tables = new Map<string, ReferenceTable>();
  if (files.length > REFERENCE_LIMITS.kinds) {
    issues.push(tableIssue(REFERENCES_ROOT, '', TABLE_PROBLEMS.tooManyKinds(files.length)));
    return { tables: null, issues };
  }
  for (const file of files) {
    const kind = path.posix.basename(file, '.json');
    const own: ReferenceIssue[] = [];
    const table = await readTable(source, file, kind, own);
    issues.push(...capped(own, file));
    if (table && own.length === 0) tables.set(kind, table);
  }
  return { tables: tables.size > 0 ? tables : null, issues };
}

function capped(issues: ReferenceIssue[], file: string): ReferenceIssue[] {
  if (issues.length <= MAX_ISSUES_PER_FILE) return issues;
  const more = issues.length - MAX_ISSUES_PER_FILE;
  return [...issues.slice(0, MAX_ISSUES_PER_FILE), tableIssue(file, '', TABLE_PROBLEMS.moreInFile(more))];
}

function tableIssue(file: string, pointer: string, { message, fix }: ProblemText): ReferenceIssue {
  return { code: 'REFERENCES_TABLE_INVALID', pointer, message, fix, file };
}

// JSON pointer segment (RFC 6901).
function pointerSegment(key: string): string {
  return `/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Records one problem of the table being read, at a JSON pointer into its file. */
type Issue = (pointer: string, problem: ProblemText) => void;

/** The checked top-level keys of a table, before its sets are read. */
interface TableHeader {
  render: ReferenceRender;
  pattern: RegExp;
  /** null: the table has the one set DEFAULT_SET */
  by: string | null;
}

/** An image an entry names, to be checked against the code's files once all sets are read. */
interface NamedImage {
  pointer: string;
  image: string;
}

// Problems are recorded in file order; a table with any problem is left out (null).
async function readTable(
  source: ReferenceSource,
  file: string,
  kind: string,
  issues: ReferenceIssue[],
): Promise<ReferenceTable | null> {
  const issue: Issue = (pointer, problem) => issues.push(tableIssue(file, pointer, problem));
  if (!isUsableKind(kind, issue)) return null;
  const definition = await readDefinition(source, file, issue);
  if (definition === null) return null;
  const header = readHeader(definition, issue);
  if (issues.length > 0 || header === null) return null;
  const images: NamedImage[] = [];
  const sets = readSets(definition.sets, header, images, issue);
  issues.push(...(await missingImages(source, file, images)));
  if (issues.length > 0) return null;
  const signature = createHash('sha256').update(canonicalJson(definition)).digest('hex');
  return { kind, file, render: header.render, pattern: header.pattern, by: header.by, sets, signature };
}

function isUsableKind(kind: string, issue: Issue): boolean {
  if (!REFERENCE_KIND_PATTERN.test(kind)) {
    issue('', TABLE_PROBLEMS.kindInvalid(kind));
    return false;
  }
  if (ALLOWED_LINK_SCHEMES.includes(kind)) {
    issue('', TABLE_PROBLEMS.kindIsLinkScheme(kind));
    return false;
  }
  return true;
}

/** The table's JSON object without `$schema`; null when the file is too large, not JSON or not an object. */
async function readDefinition(
  source: ReferenceSource,
  file: string,
  issue: Issue,
): Promise<Record<string, unknown> | null> {
  const bytes = await source.readBytes(file);
  if (bytes.byteLength > REFERENCE_LIMITS.fileBytes) {
    issue('', TABLE_PROBLEMS.fileTooLarge(bytes.byteLength));
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    issue('', TABLE_PROBLEMS.notJson((error as Error).message));
    return null;
  }
  if (!isObject(json)) {
    issue('', TABLE_PROBLEMS.notObject());
    return null;
  }
  // `$schema` (a string) names a JSON Schema for editors; like a block definition's, it is ignored.
  const { $schema: schemaRef, ...definition } = json;
  if (schemaRef !== undefined && typeof schemaRef !== 'string') issue('/$schema', TABLE_PROBLEMS.schemaRefNotString());
  return definition;
}

/** Checks the keys besides `sets`; null when `render` or `pattern` is unusable (each reported). */
function readHeader(definition: Record<string, unknown>, issue: Issue): TableHeader | null {
  for (const key of Object.keys(definition)) {
    if (!TABLE_KEYS.includes(key)) issue(pointerSegment(key), TABLE_PROBLEMS.unknownKey(key));
  }
  if (definition.schema !== REFERENCES_SCHEMA) issue('/schema', TABLE_PROBLEMS.schemaInvalid());
  const render = definition.render;
  const renderIsKnown = render === 'image' || render === 'term';
  if (!renderIsKnown) issue('/render', TABLE_PROBLEMS.renderInvalid());
  const pattern = readPattern(definition.pattern, issue);
  const by = definition.by;
  const byIsValid = by === undefined || (typeof by === 'string' && PAGE_FIELD_NAME_PATTERN.test(by));
  if (!byIsValid) issue('/by', TABLE_PROBLEMS.byInvalid());
  if (pattern === null || !renderIsKnown) return null;
  return { render, pattern, by: typeof by === 'string' ? by : null };
}

function readPattern(value: unknown, issue: Issue): RegExp | null {
  const isUsableSource = typeof value === 'string' && value !== '' && value.length <= REFERENCE_LIMITS.patternLength;
  if (!isUsableSource) {
    issue('/pattern', TABLE_PROBLEMS.patternInvalid());
    return null;
  }
  try {
    return new RegExp(value, 'u');
  } catch (error) {
    issue('/pattern', TABLE_PROBLEMS.patternNotRegExp((error as Error).message));
    return null;
  }
}

/** The valid sets by name; the images their entries name are added to `images`. */
function readSets(
  rawSets: unknown,
  header: TableHeader,
  images: NamedImage[],
  issue: Issue,
): Map<string, Map<string, ReferenceEntry>> {
  const sets = new Map<string, Map<string, ReferenceEntry>>();
  if (rawSets !== undefined && !isObject(rawSets)) issue('/sets', TABLE_PROBLEMS.setsNotObject());
  for (const [setName, set] of Object.entries(isObject(rawSets) ? rawSets : {})) {
    const at = `/sets${pointerSegment(setName)}`;
    if (!isValidSetName(setName, header, at, issue)) continue;
    if (!isObject(set)) {
      issue(at, TABLE_PROBLEMS.setNotObject());
      continue;
    }
    sets.set(setName, readSetEntries(set, at, header, images, issue));
  }
  return sets;
}

function isValidSetName(setName: string, header: TableHeader, at: string, issue: Issue): boolean {
  if (header.by === null) {
    if (setName !== DEFAULT_SET) issue(at, TABLE_PROBLEMS.setNotDefault(setName));
    return setName === DEFAULT_SET;
  }
  if (!SET_NAME_PATTERN.test(setName)) issue(at, TABLE_PROBLEMS.setNameInvalid(setName));
  return SET_NAME_PATTERN.test(setName);
}

function readSetEntries(
  set: Record<string, unknown>,
  at: string,
  header: TableHeader,
  images: NamedImage[],
  issue: Issue,
): Map<string, ReferenceEntry> {
  const values = Object.entries(set);
  if (values.length > REFERENCE_LIMITS.entriesPerSet) issue(at, TABLE_PROBLEMS.tooManyEntries(values.length));
  const entries = new Map<string, ReferenceEntry>();
  for (const [value, raw] of values) {
    const entryAt = `${at}${pointerSegment(value)}`;
    const isUsableValue = value.length <= REFERENCE_LIMITS.valueLength && header.pattern.test(value);
    if (!isUsableValue) {
      issue(entryAt, TABLE_PROBLEMS.valueUnusable(value));
      continue;
    }
    const entry = readEntry(raw, header.render, entryAt, issue);
    if (!entry) continue;
    if (entry.image !== undefined) images.push({ pointer: `${entryAt}/image`, image: entry.image });
    entries.set(value, entry);
  }
  return entries;
}

/** REFERENCES_IMAGE_MISSING for each named image inside references/ that the code does not have. */
async function missingImages(
  source: ReferenceSource,
  file: string,
  images: readonly NamedImage[],
): Promise<ReferenceIssue[]> {
  const missing: ReferenceIssue[] = [];
  for (const { pointer, image } of images) {
    const release = referenceImagePath(image);
    if (release === null || (await source.isFile(release))) continue;
    const { message, fix } = TABLE_PROBLEMS.imageMissing(release);
    missing.push({ code: 'REFERENCES_IMAGE_MISSING', pointer, message, fix, file });
  }
  return missing;
}

/** One entry; null when any of its keys is invalid (each reported). */
function readEntry(raw: unknown, render: ReferenceRender, at: string, issue: Issue): ReferenceEntry | null {
  if (!isObject(raw)) {
    issue(at, TABLE_PROBLEMS.entryNotObject());
    return null;
  }
  let ok = true;
  const fail: Issue = (pointer, problem) => {
    ok = false;
    issue(pointer, problem);
  };
  const allowed = ENTRY_KEYS[render];
  for (const key of Object.keys(raw)) {
    if (allowed.includes(key)) continue;
    fail(`${at}${pointerSegment(key)}`, TABLE_PROBLEMS.entryUnknownKey(key, render, allowed));
  }
  const entry: ReferenceEntry = {};
  if (render === 'image') readImageKeys(raw, entry, at, fail);
  else if (raw.href !== undefined) readHref(raw.href, entry, at, fail);
  readTexts(raw, render, entry, at, fail);
  return ok ? entry : null;
}

function readImageKeys(raw: Record<string, unknown>, entry: ReferenceEntry, at: string, fail: Issue): void {
  const image = raw.image;
  if (typeof image === 'string' && isImageReference(image)) entry.image = image;
  else fail(`${at}/image`, TABLE_PROBLEMS.imageInvalid());
  for (const side of ['width', 'height'] as const) {
    const value = raw[side];
    if (value === undefined) continue;
    if (isImageSide(value)) entry[side] = value;
    else fail(`${at}/${side}`, TABLE_PROBLEMS.sideInvalid(side));
  }
}

function isImageSide(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= REFERENCE_LIMITS.imageSide;
}

function readHref(href: unknown, entry: ReferenceEntry, at: string, fail: Issue): void {
  if (typeof href === 'string' && isTermHref(href)) entry.href = href;
  else fail(`${at}/href`, TABLE_PROBLEMS.hrefInvalid());
}

// A term links to a root path of the site or to an https: URL, never protocol-relative.
function isTermHref(href: string): boolean {
  if (!checkLinkUrl(href).ok) return false;
  const isRootOrHttps = href.startsWith('/') || /^https:/i.test(href);
  return isRootOrHttps && !href.startsWith('//');
}

function readTexts(
  raw: Record<string, unknown>,
  render: ReferenceRender,
  entry: ReferenceEntry,
  at: string,
  fail: Issue,
): void {
  const keys = render === 'image' ? (['name'] as const) : (['label', 'title'] as const);
  for (const key of keys) {
    if (raw[key] === undefined) continue;
    const text = readLangText(raw[key]);
    if (text === null) fail(`${at}/${key}`, TABLE_PROBLEMS.langTextInvalid(key));
    else entry[key] = text;
  }
}

function isImageReference(image: string): boolean {
  if (/^https:\/\/[^\s/]+\/\S*$/i.test(image)) return true;
  if (image === '' || image.startsWith('/')) return false;
  const hasForbiddenCharacter = /[\\\s?#]/.test(image);
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(image);
  if (hasForbiddenCharacter || hasScheme) return false;
  const isHiddenOrRelative = (part: string) => part === '' || part === '.' || part === '..' || part.startsWith('.');
  if (image.split('/').some(isHiddenOrRelative)) return false;
  return IMAGE_EXTENSIONS.includes(path.posix.extname(image));
}

function readLangText(value: unknown): LangText | null {
  if (!isObject(value)) return null;
  const out: Record<string, string> = {};
  for (const [lang, text] of Object.entries(value)) {
    if (!LANG_PATTERN.test(lang) || !isUsableText(text)) return null;
    out[lang] = text;
  }
  return out;
}

function isUsableText(text: unknown): text is string {
  return typeof text === 'string' && text.trim() !== '' && text.length <= REFERENCE_LIMITS.textLength;
}

/**
 * The text of a language: the page language, then its primary subtag, then the first text the
 * table has; null without any.
 */
export function textIn(text: LangText | undefined, lang: string): string | null {
  if (!text) return null;
  const primary = lang.toLowerCase().split('-')[0];
  const first = Object.values(text).find((value): value is string => typeof value === 'string');
  return text[lang] ?? text[primary] ?? first ?? null;
}
