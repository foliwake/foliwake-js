import { COMMAND } from '../settings.js';
import type { Changes } from '../core-types.js';

const C = COMMAND;

function summary({ changed, new: added, invalid, liveOnly }: Changes['counts']): string {
  const parts = (
    [
      [changed, 'changed'],
      [added, 'new'],
      [invalid, 'invalid'],
      [liveOnly, 'live only'],
    ] satisfies Array<[number, string]>
  ).filter(([n]) => n > 0);
  return parts.length ? parts.map(([n, label]) => `${n} ${label}`).join(', ') : 'none (working directory matches live)';
}

/** The lines `foliwake page changes` prints. */
export function pageChangesLines({ live, pages, counts }: Changes): string[] {
  const lines: string[] = [];
  if (!live) lines.push(`No live site yet; every page is new. \`${C} code prepare\` makes release 1 of the site.`);
  if (pages.length) {
    const header = ['page', 'path', 'file', 'state'];
    const cells = pages.map((r) => [
      r.id ?? '-',
      r.path ?? '-',
      r.file ?? '-',
      r.detail ? `${r.state}: ${r.detail}` : r.state,
    ]);
    const widths = header.map((h, i) => Math.max(h.length, ...cells.map((row) => row[i].length)));
    const line = (row: string[]): string =>
      row
        .map((cell, i) => cell.padEnd(widths[i]))
        .join('  ')
        .trimEnd();
    lines.push(line(header), ...cells.map(line));
  } else lines.push('No differences from the live site.');
  lines.push(`Drafts: ${summary(counts)}.`);
  return lines;
}
