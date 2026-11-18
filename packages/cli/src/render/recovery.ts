// `operation recover` for people: what it settled and what is left of the cache refreshes.
import { COMMAND } from '../settings.js';

import type { Recovery } from '../core-types.js';
import { operationRow } from './operation.js';

const C = COMMAND;

function refreshLine({ cacheRefresh: refresh }: Recovery['engine']): string | null {
  const notRequired = refresh.notRequired
    ? `, ${refresh.notRequired} not required (recorded while no cache was configured; nothing sent)`
    : '';
  const counted = `${refresh.processed} refresh(es) done${notRequired}`;
  const waited = refresh.timeoutMs > 0;
  if (refresh.state === 'pending' && refresh.held && refresh.held === refresh.pending)
    return (
      `Cache refresh: ${counted}, ${refresh.pending} kept pending: ` +
      `${refresh.reason ?? 'no cache is configured now'}.`
    );
  if (refresh.state === 'pending' && waited) {
    return (
      `Cache refresh not finished after ${Math.round(refresh.timeoutMs / 1000)} s: ${counted}, ` +
      `${refresh.pending < 0 ? 'an unknown number' : refresh.pending} still pending ` +
      `(${refresh.reason ?? 'not finished'}). They stay recorded; run \`${C} operation recover --wait\` again. ` +
      `Visitors may still see previous versions until then.`
    );
  }
  if (waited) return `Cache refresh done (${counted}).`;
  return refresh.processed || refresh.notRequired ? `Cache refresh: ${counted}.` : null;
}

export function recoveryLines(answer: Recovery): string[] {
  const { engine } = answer;
  const lines = [
    `Recovered. ${engine.interrupted} interrupted operation(s) handled. Live release ` +
      `${engine.live?.generation ?? 'none'}; pending cache refreshes: ${engine.pendingInvalidations}.`,
  ];
  for (const operation of answer.operations) lines.push(`  ${operationRow(operation)}`);
  for (const warning of engine.blockWarnings)
    lines.push(
      `Warning: ${warning.message}`,
      '  Check these pages with the new code in preview; republish them to compile them with the new definition.',
    );
  const refresh = refreshLine(engine);
  return refresh ? [...lines, refresh] : lines;
}
