// Problems for people in a terminal (lib/problems.ts): a header line that says what happened and
// what did not change, then the problems grouped by page (file), one line each with what to do under it.
// Each line ends with its code, small (dim where the terminal can); the engine's own text
// and the other technical details are shown with --verbose.
import type { Diagnostic } from '../lib/diagnostics.js';
import { type Problem, groupProblems, problemCount, problemMark, problemOf } from '../lib/problems.js';

/** A page a preview left out, with its diagnostics. */
export interface SkippedPage {
  /** The page ID, or null when the file has none. */
  page: string | null;
  /** Content-root-relative file. */
  file: string;
  title: string | null;
  lang: string | null;
  path: string | null;
  diagnostics: Array<{
    code: string;
    severity: 'error' | 'warning';
    line: number;
    message: string;
    fix: string | null;
  }>;
}

/** `Preview not updated · published pages unchanged · 4 problems`; parts that are empty are left out. */
export function headerLine(
  parts: ReadonlyArray<string | null | false | undefined>,
  problems: readonly Problem[],
): string {
  return [...parts.filter((part): part is string => Boolean(part)), problems.length ? problemCount(problems) : null]
    .filter(Boolean)
    .join(' · ');
}

/** Whether codes may be dimmed: an interactive terminal, and colour not turned off (NO_COLOR, TERM=dumb). */
export function canDim(stream: { isTTY?: boolean } = process.stdout, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(stream.isTTY) && env.NO_COLOR === undefined && env.TERM !== 'dumb';
}

const codeTag = (code: string, dim: boolean): string => (dim ? `\x1b[2m[${code}]\x1b[22m` : `[${code}]`);

/** `  (file)` after a group's label when the label does not already name the file. */
function fileNote(group: { label: string; file: string | null }): string {
  const named = group.label === group.file || group.label.startsWith(`${group.file} `);
  return group.file && !named ? `  (${group.file})` : '';
}

/** The grouped problem lines, indented by `indent`; `dim`: the codes dimmed (ANSI), see canDim. */
export function problemLines(
  problems: readonly Problem[],
  { verbose = false, indent = '', dim = false }: { verbose?: boolean; indent?: string; dim?: boolean } = {},
): string[] {
  const lines: string[] = [];
  for (const group of groupProblems(problems)) {
    lines.push(`${indent}${group.label}${fileNote(group)}`);
    for (const problem of group.problems) {
      lines.push(
        `${indent}  ${problemMark(problem)} ` +
          `${problem.line !== null ? `line ${problem.line}: ` : ''}${problem.message}  ${codeTag(problem.code, dim)}`,
      );
      if (problem.hint) lines.push(`${indent}    → ${problem.hint}`);
      if (verbose && problem.details) lines.push(`${indent}    engine: ${problem.details}`);
    }
  }
  return lines;
}

/** Problems from content diagnostics (preview, publish, page check): the file as the content root names it. */
export function contentProblems(diagnostics: readonly Diagnostic[], page: Problem['page'] = null): Problem[] {
  return diagnostics.map((d) =>
    problemOf({ code: d.code, severity: d.severity, file: d.file, line: d.line, message: d.message, fix: d.fix, page }),
  );
}

/** Problems of the pages a preview left out: each page's errors, or one line saying it was left out. */
export function leftOutProblems(pages: readonly SkippedPage[]): Problem[] {
  return pages.flatMap((page) => {
    const facts = { title: page.title, lang: page.lang, path: page.path };
    if (page.diagnostics.length === 0) {
      return [
        problemOf({
          code: 'PAGE_LEFT_OUT',
          severity: 'error',
          file: page.file,
          message: 'This page was left out of the preview.',
          fix: page.page === null ? 'Give the file an `id` in its front matter.' : null,
          page: facts,
        }),
      ];
    }
    return page.diagnostics.map((d) =>
      problemOf({
        code: d.code,
        severity: d.severity,
        file: page.file,
        line: d.line,
        message: d.message,
        fix: d.fix,
        page: facts,
      }),
    );
  });
}
