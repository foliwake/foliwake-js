// Helpers of the @foliwake/site-check tests.

/** A problem of a YAML site file as one line, as the engine wrote it before problems were structured. */
export function problemText({ line, column, field, message }) {
  return `${line}:${column} ${field ? `${field}: ` : ''}${message}`;
}
