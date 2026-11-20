import { COMMAND } from '../settings.js';
import type { SourceList } from '../core-types.js';

const C = COMMAND;

/** The lines `foliwake source list` prints. */
function notSyncedNote(source: { mode: string; id: string; enabled: boolean }): string {
  if (!source.enabled) return ` — disabled: \`${C} source enable --source ${source.id}\` first`;
  if (source.mode !== 'snapshot') return ' (preview and publish read the folder at command start)';
  return ` — preview and publish need \`${C} source sync --source ${source.id}\``;
}

export function sourceListLines({ site, sources, identity, registryProblems }: SourceList): string[] {
  const lines = [`Site ${site}: ${sources.length} content source(s)`];
  for (const source of sources) {
    const flags = [source.status, source.enabled ? 'enabled' : 'disabled'].join(', ');
    lines.push(`\n${source.id}  ${source.displayName} (${source.plugin})  owns ${source.owns.join(' ')}  ${flags}`);
    if (source.problem) lines.push(`  ${source.problem}`);
    if (!source.enabled) lines.push(`  DISABLED: not synced; preview and publish keep its selected snapshot`);
    const selected = source.selected;
    lines.push(
      selected
        ? `  selected ${selected.snapshot} (sequence ${selected.sequence}) · ${selected.selected_at} · ` +
            `${selected.items} page(s), ${selected.warnings} ` +
            `warning(s)${selected.current ? '' : ' · configuration changed since'}`
        : `  not synced${notSyncedNote(source)}`,
    );
    const latest = source.latestAttempt;
    if (latest?.status === 'running' && latest.runner === 'foreign-host')
      lines.push(`  attempt ${latest.sequence} is running on another host (cannot be checked from here)`);
    if (source.stale && latest)
      lines.push(
        `  latest sync (attempt ${latest.sequence}, ${latest.finished_at ?? '?'}) was NOT accepted: ` +
          `${latest.code ?? latest.status}, ${latest.errors} error(s)`,
      );
  }
  const { ledger, verifiedHeads } = identity;
  if (ledger.observed + ledger.bound + ledger.published > 0)
    lines.push(
      `\nPage ledger: ${ledger.published} published, ${ledger.bound} reserved, ${ledger.observed} observed without ` +
        `owner; verified ${verifiedHeads.map((h) => `${h.channel} generation ${h.generation}`).join(', ') || 'never'}.`,
    );
  for (const problem of registryProblems)
    lines.push(
      `\nPlugin registry: ${problem.code}: ${problem.pluginId ?? problem.package ?? 'the file'}: ${problem.message} ` +
        `(--debug says why)`,
    );
  return lines;
}
