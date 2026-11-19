// How init reports: one line per step for people, or one JSON object (`--json`). Never a secret value: init
// writes only variable names with empty values.
import type { StepResult } from './apply.js';
import type { CheckResult } from './check.js';
import { siteLine, type SiteFacts } from './site.js';

const MARK: Record<StepResult['outcome'], string> = {
  created: '✓',
  updated: '✓',
  exists: '·',
  skipped: '!',
  manual: '!',
};

/** The result of an init run, as `--json` prints it. */
export interface InitReport {
  ok: boolean;
  dryRun: boolean;
  site: string;
  url: string;
  blocks: string | null;
  steps: StepResult[];
  warnings: string[];
  next: string[];
}

function stepLine(step: StepResult, dryRun: boolean): string {
  const changes = step.outcome === 'created' || step.outcome === 'updated';
  const outcome = dryRun && changes ? `would be ${step.outcome}` : step.outcome;
  const note = step.note ? ` (${step.note})` : '';
  return `${MARK[step.outcome]} ${step.path.padEnd(36)} ${outcome}: ${step.what}${note}`;
}

/** What to do after init. */
export function nextSteps(site: string, opts: { preview: boolean; hook: boolean; mount: string | null }): string[] {
  const steps = [`Run the app (npm run dev) and open http://localhost:3000${opts.mount ?? ''}/<a page of the site>.`];
  if (opts.preview) {
    steps.push(
      `Preview: a site admin runs \`foliwake site preview-token --site ${site}\`; ` +
        'put the token in .env.local as FOLIWAKE_PREVIEW_TOKEN (never commit it). ' +
        'Replace isAuthor() before you deploy.',
    );
  }
  if (opts.hook) {
    steps.push(
      "Hook: ask the site admin to add https://<your app>/foliwake/hook as the site's app hook, " +
        'and put the shared secret in FOLIWAKE_HOOK_SECRET.',
    );
  }
  return steps;
}

/** The report for people. */
export function humanReport(report: InitReport, facts: SiteFacts): string {
  const lines = [`✓ ${siteLine(facts)}`, ...report.steps.map((step) => stepLine(step, report.dryRun))];
  for (const warning of report.warnings) lines.push(`! ${warning}`);
  if (report.dryRun) lines.push('Dry run: nothing was written.');
  for (const step of report.next) lines.push(`Next: ${step}`);
  return `${lines.join('\n')}\n`;
}

/** The `--check` report for people. */
export function checkReport(checks: readonly CheckResult[]): string {
  return `${checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`).join('\n')}\n`;
}
