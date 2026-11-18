import type { ProbeAnswer } from '../core-types.js';

const SHOWN_ROWS = 50;

function fieldLines(fields: ProbeAnswer['fields']): string[] {
  return Object.entries(fields).map(([field, message]) => `  ${field}: ${message}`);
}

function credentialLines(credentials: ProbeAnswer['credentials']): string[] {
  return credentials.map((c) => {
    const state = c.set
      ? 'set'
      : 'not set: `foliwake credential set` (the installation owner) or the server environment';
    const account = c.serviceAccount ? ` · share the folder with ${c.serviceAccount.clientEmail} (Viewer)` : '';
    return `  ${c.field} → ${c.name}: ${state}${account}`;
  });
}

function connectionLines(connection: NonNullable<ProbeAnswer['connection']>): string[] {
  const head = connection.ok ? `Connected: ${connection.target}` : `Not connected: ${connection.target}`;
  const problems = connection.problems.map((p) => `  ${p.severity} ${p.code}: ${p.message}${p.fix ? ` ${p.fix}` : ''}`);
  return [head, ...problems];
}

function addressOf(row: NonNullable<ProbeAnswer['layout']>['rows'][number]): string {
  if (row.outcome === 'page') return row.pagePath ?? '';
  if (row.outcome === 'file') return '(decided by the file)';
  if (row.outcome === 'ignored') return 'ignored';
  return `no rule fits: ${row.problem ?? ''}`;
}

function layoutLines(answer: ProbeAnswer): string[] {
  const { listing, layout } = answer;
  if (listing === null) return [];
  if (!listing.ok) return [`Listing failed: ${listing.problem?.code}: ${listing.problem?.message}`];
  const lines = [`${listing.total} file(s)${listing.truncated ? `; the first ${listing.items.length} are shown` : ''}`];
  for (const row of (layout?.rows ?? []).slice(0, SHOWN_ROWS)) lines.push(`  ${row.document} → ${addressOf(row)}`);
  if ((layout?.rows.length ?? 0) > SHOWN_ROWS)
    lines.push(`  … ${layout!.rows.length - SHOWN_ROWS} more (--json shows all)`);
  if (layout && layout.unmatched > 0)
    lines.push(`${layout.unmatched} file(s) fit no rule: the first sync refuses until they are mapped or ignored.`);
  for (const d of layout?.duplicates ?? [])
    lines.push(`Two or more files for ${d.pagePath}: ${d.documents.join(', ')}`);
  return lines;
}

function suggestionLines(suggestions: ProbeAnswer['suggestions']): string[] {
  if (suggestions.owns.length === 0) return [];
  const overlaps = suggestions.overlaps.map((o) => `${o.path} (owned by "${o.source}")`);
  const tail = overlaps.length ? ` · overlaps ${overlaps.join(', ')}` : ' · no overlap with other sources';
  return [`Owned paths that cover these addresses: ${suggestions.owns.join(' ')}${tail}`];
}

/** The lines `foliwake source check` prints for one probed source. Nothing was saved or fetched into a snapshot. */
export function probeLines(answer: ProbeAnswer): string[] {
  const head = `Source ${answer.source} (${answer.plugin}) of site ${answer.site}: checked ${answer.checkedAt}`;
  if (Object.keys(answer.fields).length > 0)
    return [head, 'The entry has problems; nothing was contacted:', ...fieldLines(answer.fields)];
  const lines = [head, ...credentialLines(answer.credentials)];
  if (answer.connection) lines.push(...connectionLines(answer.connection));
  return [...lines, ...layoutLines(answer), ...suggestionLines(answer.suggestions)];
}
