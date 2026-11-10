// Page globs of `app.pages`: the query-index glob grammar (release-formats query.ts, copied; an equality test
// keeps them in step). `/`-separated segments of [a-z0-9-] literals, `*` within a segment, `**` as a whole
// segment (zero or more segments; `/x/**` also matches `/x`).

const GLOB_SEGMENT = /^[a-z0-9*-]+$/;
export const GLOB_LIMITS = Object.freeze({ globsPerList: 20, globLength: 200 });

/** Why `glob` is not a valid bounded glob (null: it is). */
export function globProblem(glob: string): string | null {
  if (glob.length > GLOB_LIMITS.globLength) return `is longer than ${GLOB_LIMITS.globLength} characters`;
  if (!glob.startsWith('/')) return 'must start with /';
  if (glob === '/') return null;
  for (const segment of glob.slice(1).split('/')) {
    if (segment === '') return 'has an empty segment (// or a trailing /)';
    if (segment === '**') continue;
    if (!GLOB_SEGMENT.test(segment)) return 'may only use a-z, 0-9, -, * (within a segment) and ** (a whole segment)';
    if (segment.includes('**')) return 'uses ** inside a segment; ** must be a whole segment';
  }
  return null;
}

export type CompiledGlob = ReadonlyArray<'**' | readonly string[]>;

export function compileGlob(glob: string): CompiledGlob {
  if (glob === '/') return [];
  return glob.slice(1).split('/').map((segment) => (segment === '**' ? '**' : segment.split('*')));
}

function segmentMatches(parts: readonly string[], segment: string): boolean {
  if (parts.length === 1) return parts[0] === segment;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  if (!segment.startsWith(first) || segment.length < first.length + last.length || !segment.endsWith(last)) return false;
  let at = first.length;
  const end = segment.length - last.length;
  for (let i = 1; i < parts.length - 1; i++) {
    const found = segment.indexOf(parts[i]!, at);
    if (found === -1 || found + parts[i]!.length > end) return false;
    at = found + parts[i]!.length;
  }
  return true;
}

/** Whether the page path matches the compiled glob. */
export function globMatches(glob: CompiledGlob, pagePath: string): boolean {
  const segments = pagePath === '/' ? [] : pagePath.slice(1).split('/');
  const s = segments.length;
  let next = new Array<boolean>(s + 1).fill(false);
  next[s] = true;
  for (let i = glob.length - 1; i >= 0; i--) {
    const current = new Array<boolean>(s + 1).fill(false);
    const part = glob[i]!;
    if (part === '**') {
      for (let j = s; j >= 0; j--) current[j] = next[j]! || (j < s && current[j + 1]!);
    } else {
      for (let j = 0; j < s; j++) current[j] = next[j + 1]! && segmentMatches(part, segments[j]!);
    }
    next = current;
  }
  return next[0]!;
}
