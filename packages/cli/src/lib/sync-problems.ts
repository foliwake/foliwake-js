// The problems of a sync result stored before results carried `problems`: made from its diagnostics, without
// page facts (the source's path mapping rules are on the server).
import { type Problem, problemOf } from './problems.js';

/** A diagnostic of a content source, as a sync result holds it. */
export interface SourceDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  source: string;
  message: string;
  fix?: string | null;
  origin?: { kind: 'file'; file: string; line: number } | { kind: 'element'; document: string } | { kind: string };
}

function fileOf(d: SourceDiagnostic): { file: string | null; line: number | null } {
  const origin = d.origin as { kind: string; file?: string; line?: number; document?: string } | undefined;
  if (origin?.kind === 'file' && origin.file)
    return { file: origin.file, line: (origin.line ?? 0) > 0 ? origin.line! : null };
  if (origin?.kind === 'element' && origin.document) return { file: origin.document, line: null };
  return { file: null, line: null };
}

/** The problems of a sync attempt's diagnostics, in their order. */
export function syncProblems(diagnostics: readonly SourceDiagnostic[]): Problem[] {
  return diagnostics.map((d) => {
    const { file, line } = fileOf(d);
    const input = { code: d.code, severity: d.severity, source: d.source, file, line, message: d.message };
    return problemOf(
      { ...input, fix: d.fix, page: null },
      d.code === 'SOURCE_PATH_UNMAPPED' ? { expectedFiles: [] } : {},
    );
  });
}
