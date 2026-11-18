// Grouping and counting of problems (problems.ts). Structural types only.

/** The fields of a problem that grouping reads. */
export interface GroupedProblem {
  severity: 'error' | 'warning' | 'info';
  source: string | null;
  file: string | null;
  line: number | null;
  page: { title: string | null; lang: string | null } | null;
  url: string | null;
}

type ProblemSeverity = GroupedProblem['severity'];

/** Problems of one page or file, in the order found. */
export interface ProblemGroup<G extends GroupedProblem = GroupedProblem> {
  /** What the group is about: the page title with its language, else the file, else `General`. */
  label: string;
  file: string | null;
  source: string | null;
  url: string | null;
  problems: G[];
}

function groupLabel(problem: GroupedProblem): string {
  const title = problem.page?.title ?? null;
  const lang = problem.page?.lang ?? null;
  if (title) return lang ? `${title} · ${lang}` : title;
  if (problem.file) return lang ? `${problem.file} · ${lang}` : problem.file;
  return 'General';
}

/** Problems grouped by file (a file is a page), errors first within a group; groups with errors first, then by file. */
export function groupProblems<G extends GroupedProblem>(problems: readonly G[]): ProblemGroup<G>[] {
  const groups = new Map<string, ProblemGroup<G>>();
  for (const problem of problems) {
    const key = `${problem.source ?? ''}\0${problem.file ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        label: groupLabel(problem),
        file: problem.file,
        source: problem.source,
        url: problem.url,
        problems: [],
      };
      groups.set(key, group);
    }
    group.url ??= problem.url;
    group.problems.push(problem);
  }
  const rank: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 };
  const worst = (group: ProblemGroup<G>): number => Math.min(...group.problems.map((p) => rank[p.severity]));
  for (const group of groups.values())
    group.problems.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.line ?? 0) - (b.line ?? 0));
  return [...groups.values()].sort(
    (a, b) =>
      worst(a) - worst(b) ||
      (a.file === null ? 1 : b.file === null ? -1 : a.file < b.file ? -1 : a.file > b.file ? 1 : 0),
  );
}

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** `4 problems` / `2 problems, 1 note`: errors and warnings counted apart only when both exist. */
export function problemCount(problems: readonly GroupedProblem[]): string {
  const errors = problems.filter((p) => p.severity === 'error').length;
  const notes = problems.length - errors;
  if (errors && notes) return `${count(errors, 'problem')}, ${count(notes, 'note')}`;
  return errors ? count(errors, 'problem') : count(notes, 'note');
}

/** What a problem line shows: `✗ line 12: message` / `⚠ message`. */
export function problemMark(problem: GroupedProblem): string {
  return problem.severity === 'error' ? '✗' : problem.severity === 'warning' ? '⚠' : 'ℹ';
}
