// Problems for authors: what the engine found in a source's files, as fields rather than one sentence, so each
// client can show them its own way. The plain texts are English; a client that localises maps `code` (and
// `facts`) to its own words, and falls back to `message`/`hint` for a code it does not know.

export interface Problem {
  severity: 'error' | 'warning' | 'info';
  /** Stable code, for support and for a client's own wording. */
  code: string;
  /** The content source the file belongs to; null when not known or not file-related. */
  source: string | null;
  /** The file as the source shows it (source-relative); null: no file. */
  file: string | null;
  /** 1-based line in the file; null when the whole file is meant or the line is not known. */
  line: number | null;
  /** The page the file is, as far as it is known. */
  page: { title: string | null; lang: string | null; path: string | null } | null;
  /** A web address that opens the file (or its folder) in the source; null when none is known. */
  url: string | null;
  /** What is wrong, in plain words. */
  message: string;
  /** What to do about it; null when nothing is needed. */
  hint: string | null;
  /** The engine's technical text, for support. */
  details: string | null;
  /** Further structured fields of this problem, as the engine gave them. */
  facts: Record<string, unknown>;
}

export type ProblemSeverity = Problem['severity'];

export interface ProblemInput {
  code: string;
  severity: ProblemSeverity;
  source?: string | null;
  file?: string | null;
  line?: number | null;
  message: string;
  fix?: string | null;
  page?: Problem['page'];
  url?: string | null;
  facts?: Record<string, unknown>;
}

/** What the author texts can use besides the diagnostic itself. */
export interface ProblemContext {
  /** File names the source's path mapping rules expect (SOURCE_PATH_UNMAPPED), e.g. `lesson/{lang}.md`. */
  expectedFiles?: readonly string[];
}

const IMAGE_NAME = /[^\s"'`()<>]*\.(?:png|jpe?g|gif|webp|avif|svg)\b/i;
const HTML_TAG = /<\/?([A-Za-z][A-Za-z0-9-]*)/;

const quote = (text: string): string => `\`${text}\``;
const baseName = (file: string): string => file.split('/').filter(Boolean).at(-1) ?? file;
const folderOf = (file: string): string => file.split('/').filter(Boolean).slice(0, -1).join('/');

// A hint of the engine worth keeping next to the plain one (a near name it found).
const nearName = (fix: string | null | undefined): string | null =>
  fix && /^(Did you mean|Match the exact letter case)/.test(fix) ? fix : null;

type AuthorText = (
  input: ProblemInput,
  context: ProblemContext,
) => { message: string; hint: string | null; facts?: Record<string, unknown> };

/** Plain texts by code; a code without one keeps the engine's message and fix. */
const AUTHOR_TEXTS: Readonly<Record<string, AuthorText>> = {
  CONTENT_IMAGE_NOT_FOUND: (input) => {
    const found = IMAGE_NAME.exec(input.message)?.[0] ?? null;
    const image = found ? found.replace(/^\.\//, '') : null;
    const name = image ? baseName(image) : null;
    const folder = image ? folderOf(image) : '';
    const near = nearName(input.fix);
    return {
      message: name
        ? `The picture ${quote(name)} is missing${folder ? ` from the folder ${quote(folder)}` : ''}.`
        : 'A picture the page shows is missing.',
      hint:
        `${near ? `${near} ` : ''}If you have just copied the files, wait until the upload has finished and ` +
        `update the preview again. Otherwise check the file name: capital and small letters are different.`,
      ...(image ? { facts: { image } } : {}),
    };
  },
  SECTION_EMPTY: () => ({
    message: 'An extra `---` line leaves an empty section; it was skipped.',
    hint: 'Nothing has to be done. Remove the extra `---` line to make this note go away.',
  }),
  CONTENT_H1_COUNT: (input) =>
    /\bno `#` heading/.test(input.message)
      ? { message: 'The page has no heading.', hint: 'Add a line `# Title of the page` before the text.' }
      : {
          message: 'The page has more than one main heading (`#`).',
          hint: 'Keep one `# Title` line; change the other `#` headings to `##`.',
        },
  CONTENT_RAW_HTML: (input) => {
    const tag = HTML_TAG.exec(input.message)?.[1]?.toLowerCase() ?? null;
    return {
      message: `HTML tags${tag ? ` (${quote(`<${tag}>`)})` : ''} are not supported.`,
      hint:
        tag === 'details'
          ? 'Write the answer as ordinary text instead, for example `> **Answer:** …`.'
          : 'Write it as ordinary text or Markdown instead. To show a `<` as text, write `&lt;`.',
      ...(tag ? { facts: { tag } } : {}),
    };
  },
  CONTENT_FRONT_MATTER_MISSING: () => ({
    message:
      'The settings block between `---` lines at the top of the file is missing, not closed, or not written correctly.',
    hint:
      'Start the file with a `---` line, write one `key: value` per line (for example `title: Name of the ' +
      'page`), and close it with another `---` line.',
  }),
  SOURCE_PATH_UNMAPPED: (input, context) => {
    const expected = context.expectedFiles ?? [];
    return {
      message: 'This file is not where Foliwake expects it, so it does not become a page.',
      hint:
        `${expected.length ? `Expected file names: ${expected.map(quote).join(', ')}. ` : ''}Move or rename the ` +
        `file, or ask your administrator to add a rule for it.`,
      ...(expected.length ? { facts: { expectedFiles: [...expected] } } : {}),
    };
  },
  MAPPINGS_RULE_UNUSED: (input) => ({
    message: `${input.message.replace(/ fits no document of the source\.$/, '')} matches no file of the source.`,
    hint: input.fix ?? null,
  }),
  SOURCE_PUBLISHED_PATH_CONFLICT: (input) => ({
    message: 'Two files want the same web address; neither is published there.',
    hint: input.fix ?? 'Give one of the pages another address (or remove one of the files).',
  }),
  SOURCE_PATH_CONFLICT: (input) => ({
    message: 'Another source already has a page at this web address.',
    hint: input.fix ?? 'Give the page another address, or ask your administrator which source owns it.',
  }),
};

/** A problem from a diagnostic: plain texts where the engine has them, its own text kept in `details`. */
export function problemOf(input: ProblemInput, context: ProblemContext = {}): Problem {
  const author = AUTHOR_TEXTS[input.code]?.(input, context) ?? null;
  return {
    severity: input.severity,
    code: input.code,
    source: input.source ?? null,
    file: input.file || null,
    line: input.line && input.line > 0 ? input.line : null,
    page: input.page ?? null,
    url: input.url ?? null,
    message: author?.message ?? input.message,
    hint: author ? author.hint : (input.fix ?? null),
    details: author ? `${input.message}${input.fix ? ` ${input.fix}` : ''}` : null,
    facts: { ...(author?.facts ?? {}), ...(input.facts ?? {}) },
  };
}

/** The codes that have a plain text for authors (tests, documentation). */
export const AUTHOR_TEXT_CODES: readonly string[] = Object.keys(AUTHOR_TEXTS);

export { type ProblemGroup, groupProblems, problemCount, problemMark } from './problem-groups.js';
