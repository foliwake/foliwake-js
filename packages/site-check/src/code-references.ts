// The reference scan of a code release: imports of its scripts and url()/@import of its stylesheets must be
// relative and stay inside the release. The only bare specifiers allowed are the kit's in scripts
// (`@foliwake/block-kit`, and `foliwake` while it is still mapped): the release's block kit, which every page maps
// with an import map. A static scan, good enough for plain ES modules and CSS
// without a parser: a guard against mistakes in trusted code, not a sandbox.
import path from 'node:path';

import { KIT_PATH, KIT_SPECIFIERS } from '@foliwake/blocks-contract/import-map';

import { type Diagnostic, makeDiagnostic } from './formats/diagnostics.js';
import { positionAt } from './formats/json-position.js';

const JS_SPECIFIERS = [
  /\bimport\s+(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']/g,
  /\bexport\s+(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s+)?from\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];
const CSS_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;
const CSS_IMPORT = /@import\s+["']([^"']+)["']/g;
// Template-literal dynamic imports and `new URL(…, import.meta.url)`. A literal without `${…}` is checked like a
// quoted specifier; an interpolated one only by its static prefix (absolute or other-origin prefixes are
// refused). Fully computed specifiers, like a loader's own `import(assetUrl(…).href)`, are not checked.
const TEMPLATE_IMPORT = /\bimport\s*\(\s*`([^`]*)`\s*\)/g;
const META_URL = /\bnew\s+URL\s*\(\s*(["'`])([^"'`]*)\1\s*,\s*import\.meta\.url\s*\)/g;
const ABSOLUTE = /^(?:\/|[a-z][a-z0-9+.-]*:)/i;

const NOT_RELATIVE_FIX = 'Use a relative path (./ or ../) to a file of the site code.';
const OUTSIDE_FIX =
  'Keep the reference inside the site code (components/, scripts/, styles/, templates/, references/).';
const MISSING_FIX = 'Add the file to the site code (and commit it), or fix the path.';

// "", ".", "..", "x/", "x/.." name directories (`new URL('.', import.meta.url)`).
const isDirectoryReference = (spec: string): boolean => spec === '' || spec.endsWith('/') || /(^|\/)\.\.?$/.test(spec);

/** Whether a release-relative path is a file of the release. */
export type HasFile = (relative: string) => boolean;

/** One file being scanned: its path, its text, and where its problems go. */
interface Scan {
  file: string;
  text: string;
  has: HasFile;
  diagnostics: Diagnostic[];
}

function report(scan: Scan, offset: number, code: string, message: string, fix: string): void {
  const { line, column } = positionAt(scan.text, offset);
  scan.diagnostics.push(makeDiagnostic({ code, file: scan.file, line, column, message, fix }));
}

const notRelative = (scan: Scan, offset: number, message: string) =>
  report(scan, offset, 'CODE_REFERENCE_NOT_RELATIVE', message, NOT_RELATIVE_FIX);
const outside = (scan: Scan, offset: number, message: string) =>
  report(scan, offset, 'CODE_REFERENCE_OUTSIDE', message, OUTSIDE_FIX);
const missing = (scan: Scan, offset: number, message: string) =>
  report(scan, offset, 'CODE_REFERENCE_MISSING', message, MISSING_FIX);

function resolveFrom(file: string, reference: string): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), reference));
}

const escapes = (resolved: string): boolean => resolved === '..' || resolved.startsWith('../');

function staticPrefix(template: string): string | null {
  const at = template.indexOf('${');
  return at === -1 ? null : template.slice(0, at);
}

function checkReference(scan: Scan, offset: number, specifier: string): void {
  if (/^data:/i.test(specifier) || specifier.startsWith('#')) return;
  if (KIT_SPECIFIERS.includes(specifier) && scan.file.endsWith('.js')) {
    if (!scan.has(KIT_PATH)) missing(scan, offset, `imports "${specifier}", but the release has no ${KIT_PATH}`);
    return;
  }
  if (!(specifier.startsWith('./') || specifier.startsWith('../'))) {
    const why = 'bare, absolute or other-origin references are not allowed';
    notRelative(scan, offset, `reference "${specifier}" is not relative (${why})`);
    return;
  }
  const resolved = resolveFrom(scan.file, specifier.replace(/[?#].*$/, ''));
  if (escapes(resolved)) outside(scan, offset, `reference "${specifier}" escapes the release directory`);
  else if (!scan.has(resolved)) {
    missing(scan, offset, `reference "${specifier}" resolves to ${resolved}, which is not in the release`);
  }
}

function checkTemplateImport(scan: Scan, offset: number, template: string): void {
  const prefix = staticPrefix(template);
  if (prefix === null) return checkReference(scan, offset, template);
  if (prefix === '') return; // fully computed: not checked
  if (ABSOLUTE.test(prefix) || !(prefix.startsWith('./') || prefix.startsWith('../'))) {
    const why = 'bare, absolute or other-origin references are not allowed';
    notRelative(scan, offset, `dynamic import \`${template}\` is not relative (${why})`);
    return;
  }
  // The directory part of the static prefix must stay inside the release.
  const directory = prefix.slice(0, prefix.lastIndexOf('/') + 1);
  if (escapes(resolveFrom(scan.file, directory))) {
    outside(scan, offset, `dynamic import \`${template}\` escapes the release directory`);
  }
}

// URL semantics: "x/y" and "./x/y" are both relative to the module; "../" may name the release root.
function checkMetaUrl(scan: Scan, offset: number, specifier: string): void {
  const prefix = staticPrefix(specifier);
  const target = prefix ?? specifier;
  const shown = `new URL("${specifier}", import.meta.url)`;
  if (ABSOLUTE.test(target)) {
    notRelative(scan, offset, `${shown} is not relative (absolute or other-origin references are not allowed)`);
    return;
  }
  const clean = target.replace(/[?#].*$/, '');
  const resolved = resolveFrom(scan.file, clean || '.');
  if (escapes(resolved)) outside(scan, offset, `${shown} escapes the release directory`);
  else if (prefix === null && !isDirectoryReference(clean) && !scan.has(resolved)) {
    missing(scan, offset, `${shown} resolves to ${resolved}, which is not in the release`);
  }
}

function scanScript(scan: Scan): void {
  for (const pattern of JS_SPECIFIERS) {
    for (const match of scan.text.matchAll(pattern)) checkReference(scan, match.index, match[1]);
  }
  for (const match of scan.text.matchAll(TEMPLATE_IMPORT)) checkTemplateImport(scan, match.index, match[1]);
  for (const match of scan.text.matchAll(META_URL)) checkMetaUrl(scan, match.index, match[2]);
}

function scanStylesheet(scan: Scan): void {
  for (const match of scan.text.matchAll(CSS_URL)) checkReference(scan, match.index, match[2].trim());
  for (const match of scan.text.matchAll(CSS_IMPORT)) checkReference(scan, match.index, match[1]);
}

const UTF8 = new TextDecoder();

/** Every reference of the release's scripts and stylesheets that is not relative, escapes or names no file. */
export function checkCodeReferences(files: ReadonlyMap<string, Uint8Array>, has: HasFile): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [file, bytes] of files) {
    const scan: Scan = { file, text: UTF8.decode(bytes), has, diagnostics };
    if (file.endsWith('.js')) scanScript(scan);
    else if (file.endsWith('.css')) scanStylesheet(scan);
  }
  return diagnostics;
}
