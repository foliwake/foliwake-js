import type { AddAnswer } from '../core-types.js';

/** The lines `foliwake source add` prints after the save. */
export function addLines(answer: AddAnswer): string[] {
  const { source } = answer;
  const rules = source.mappings ? `, ${source.mappings} path rule(s)` : '';
  const head = answer.unchanged
    ? `Source ${source.id} is already in site ${answer.site} exactly like this; nothing was written.`
    : `Saved source ${source.id} (${source.plugin}, owns ${source.owns.join(' ')}${rules}). Nothing was fetched yet.`;
  return [head, ...answer.nextSteps.map((step) => `Next: ${step}`)];
}
