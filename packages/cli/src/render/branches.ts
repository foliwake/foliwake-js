import { COMMAND } from '../settings.js';
import type { BranchHistory, BranchList } from '../core-types.js';
import { describeBranchUrls } from '../lib/rules.js';

const C = COMMAND;

/** The lines `foliwake branch list` prints. */
export function branchListLines(rows: BranchList): string[] {
  if (!rows.length) return [`No branch previews yet. Seed the default branch with \`${C} branch bootstrap\`.`];
  return rows.map((row) => {
    const where =
      row.previewUrl === null
        ? `deleted ${row.retired?.at ?? ''}`
        : describeBranchUrls({ site: row.siteBranchUrl, readable: row.readableUrl, label: row.previewUrl });
    return (
      `${(row.branch + (row.isDefault ? ' (default)' : '')).padEnd(26)}${row.codeRelease}  ` +
      `${row.sourceRevision ?? '-'}  ${where}`
    );
  });
}

/** The lines `foliwake branch history` prints. */
export function branchHistoryLines(history: BranchHistory): string[] {
  if (!history.exists) return [`Branch ${history.branch} has no selections.`];
  const head = history.retired
    ? `Branch ${history.branch} was deleted ${history.retired.at}; no host serves it. Selections, newest first:`
    : `Branch ${history.branch} (${history.previewUrl}), newest first:`;
  return [
    head,
    ...history.selections.map(
      (entry) =>
        `  ${String(entry.generation).padEnd(4)}${entry.codeRelease}  ${entry.sourceRevision ?? '-'}  ` +
        `${entry.createdAt}`,
    ),
  ];
}
