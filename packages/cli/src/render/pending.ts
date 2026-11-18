import { COMMAND } from '../settings.js';
import type { PendingAnswer } from '../core-types.js';

const C = COMMAND;
const SHOWN = 20;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The lines `foliwake source pending` prints. Editor names are plain text, shown and never stored. */
export function pendingLines({ site, sources }: PendingAnswer): string[] {
  const lines = [
    `Site ${site}: edits waiting in ${plural(sources.length, 'source')} (checked now; nothing was fetched or changed)`,
  ];
  for (const source of sources) {
    lines.push('');
    if (source.status === 'busy') {
      lines.push(`${source.source}: a sync is running now; check again when it ends.`);
      continue;
    }
    if (source.status === 'unsupported') {
      lines.push(`${source.source}: pending edits cannot be checked (${source.code}): ${source.reason}.`);
      continue;
    }
    if (source.status === 'unavailable') {
      lines.push(
        `${source.source}: the check failed (${source.code}): ` +
          `${source.reason}${source.retryAfterMs ? ` — retry in ${Math.ceil(source.retryAfterMs / 1000)} s` : ''}.`,
      );
      continue;
    }
    const { changed, new: added, removed, unknown } = source.counts;
    const parts = [
      changed && `${changed} changed`,
      added && `${added} new`,
      removed && `${removed} removed`,
      unknown && `${unknown} unknown until fetched`,
    ].filter(Boolean);
    lines.push(
      parts.length
        ? `${source.source}: ${parts.join(' · ')} since the selected snapshot`
        : `${source.source}: no new edits`,
    );
    for (const change of source.changes.slice(0, SHOWN)) {
      const who = [change.modifiedAt, change.modifiedBy?.name].filter(Boolean).join(' · ');
      lines.push(
        `  ${change.kind.padEnd(8)} ` +
          `${change.path}${change.pageId ? ` (page ${change.pageId})` : ''}${who ? `  ${who}` : ''}`,
      );
    }
    if (source.changes.length > SHOWN)
      lines.push(`  … and ${source.changes.length - SHOWN} more (--json lists every one)`);
    if (parts.length)
      lines.push(`  Take them into the preview: ${C} source sync --source ${source.source}, then ${C} preview`);
  }
  return lines;
}
