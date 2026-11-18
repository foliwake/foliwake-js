// What `site reset-storage` prints: the plan (what a reset loses and does) and the reset's end.
import { COMMAND } from '../settings.js';
import type { Operation } from '../core-types.js';
import type { ResetStoragePlan, ResetStorageResult } from '../core-types.js';

const C = COMMAND;

const size = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

function head(name: string, value: ResetStoragePlan['live']): string {
  if (!value) return `  ${name}: none`;
  const generation = value.generation === null ? '' : ` (generation ${value.generation})`;
  const code = value.codeRelease ? `, code ${value.codeRelease}` : '';
  return `  ${name}: ${value.siteRelease}${generation}${code}`;
}

export function resetPlanLines(plan: ResetStoragePlan): string[] {
  const lines = [
    `Reset storage of site ${plan.site}: what is lost`,
    '  !! Live will be EMPTY (no pages) until you publish again: the reset makes release 1 with code only.',
    head('Live', plan.live),
    head('Preview', plan.preview),
  ];
  lines.push(
    plan.history
      ? `  Release history: ${plan.history.committedReleases} committed release(s) of ` +
          `${plan.history.publisherOperations} publisher operation(s), ${plan.history.branchOperations} branch ` +
          `operation(s); page journal: ${plan.history.pageJournal} page(s). Archived in the state folder, not deleted.`
      : '  State: no state database yet.',
  );
  if (plan.storage)
    lines.push(
      `  Storage (${plan.storage.kind}): ${plan.storage.truncated ? 'at least ' : ''}${plan.storage.objects} ` +
        `object(s), ${size(plan.storage.bytes)}, ` +
        `${plan.storage.prefix ? `under ${plan.storage.prefix}` : 'the whole bucket of this site'}: DELETED.`,
    );
  else
    lines.push(
      `  Storage: could not be counted (${plan.storageProblem?.code ?? 'unknown'}: ` +
        `${plan.storageProblem?.message ?? ''}).`,
    );
  if (plan.storage?.kind !== 'local')
    lines.push(
      "  The site's storage key (R2/S3) needs permission to delete objects; without it the reset stops at " +
        'clear-storage.',
    );
  lines.push('What the reset does:', `  ${plan.steps.join(' → ')}`);
  lines.push(
    `  Code prepared again: ${plan.code.rev ?? 'HEAD of the checkout'} (${plan.code.from}); it becomes release 1, ` +
      `code and no pages.`,
  );
  lines.push(
    `  Sources synced again: ${plan.sources.length ? plan.sources.join(', ') : 'none'}. Preview and publication ` +
      `stay with you.`,
  );
  lines.push('  Kept: the operations journal, pushed content, the site configuration and its credentials.');
  if (plan.unfinishedOperations > 0)
    lines.push(
      `  ${plan.unfinishedOperations} operation(s) of this site are still queued or running: the reset is refused ` +
        `until they end.`,
    );
  if (plan.resume)
    lines.push(
      `  An earlier reset (${plan.resume.startedAt}) stopped after: ${plan.resume.done.join(', ') || 'nothing'}. ` +
        `This one goes on from there (archive ${plan.resume.archive}).`,
    );
  lines.push(
    '  Stop the integration worker of this site first, and restart origin, admin and integration afterwards: a ' +
      'process that keeps the old state open writes into the archive.',
  );
  return lines;
}

export function resetResultLines(operation: Operation): string[] {
  if (operation.state !== 'succeeded') {
    return [
      `The reset did not finish ` +
        `(${operation.state}${operation.error ? `: ${operation.error.code}: ${operation.error.message}` : ''}).`,
      `\`${C} operation get ${operation.id} --site ${operation.site}\` shows its steps.`,
    ];
  }
  const result = operation.result as ResetStorageResult;
  return [
    `Storage of site ${result.site} reset${result.resumed ? ' (went on from an earlier run)' : ''}: ` +
      `${result.objectsDeleted} object(s) deleted, old state archived as ${result.archive}.`,
    `  Release 1: ${releaseOneText(result)}. Sources synced (${result.sync.state}).`,
    `Nothing was published. Next: \`${C} preview --site ${result.site}\`, check it, then \`${C} publish --site ` +
      `${result.site}\`.`,
  ];
}

function releaseOneText({ codePrepare }: ResetStorageResult): string {
  const code = codePrepare.codeRelease ? ` with code ${codePrepare.codeRelease}` : '';
  return `${codePrepare.siteRelease ?? 'made earlier'}${code}`;
}
