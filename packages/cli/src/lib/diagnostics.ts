// A diagnostic of the content rules, as the engine reports it, and its one-line form for a terminal.

export type Severity = 'error' | 'warning';

/** A diagnostic: every key present. */
export interface Diagnostic {
  code: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  component: string | null;
  field: string | null;
  message: string;
  fix: string | null;
}

/** `file:line:column severity CODE component field: message`, and the fix on its own line. */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  const { file, line, column, severity, code, component, field, message, fix } = diagnostic;
  let head = `${file}:${line}:${column} ${severity} ${code}`;
  if (component) head += ` ${component}`;
  if (field) head += ` ${field}`;
  head += `: ${message}`;
  return fix ? `${head}\n    fix: ${fix}` : head;
}
