import { COMMAND } from '../settings.js';
import type { SourceEnabled } from '../core-types.js';

const C = COMMAND;

/** What a disabled source keeps: its snapshot in preview, its live pages, its paths. */
function keptLine({ selected }: SourceEnabled): string {
  const preview = selected ? `preview keeps reading snapshot ${selected}` : 'it has no snapshot, so preview has none';
  return `  Not synced and skipped by preview; ${preview}. Its live pages and owned paths are kept.`;
}

/** The lines `foliwake source disable|enable` prints. */
export function sourceEnabledLines(answer: SourceEnabled): string[] {
  const state = answer.enabled ? 'enabled' : 'disabled';
  const head = answer.unchanged
    ? `${answer.site}: source ${answer.source} was already ${state}; nothing changed.`
    : `${answer.site}: source ${answer.source} ${state}; revision ${answer.revision}.`;
  if (!answer.enabled)
    return [head, keptLine(answer), `  Enable it again: ${C} source enable --source ${answer.source}`];
  return [head, `  Its next sync continues from its selected snapshot: ${C} source sync --source ${answer.source}`];
}
