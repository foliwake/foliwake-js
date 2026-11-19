// `npx @foliwake/next init`: detect the app, check the site, plan, apply (or show the plan), report.
// Exit codes: 0 done, 1 error, 2 input needed.
import { checkMount } from '../page-route.js';
import { applySteps } from './apply.js';
import { checkSetup } from './check.js';
import { detectProject, InitError, supportsNext, type Project } from './detect.js';
import { parseOptions, USAGE, UsageError, type InitOptions } from './options.js';
import { planSteps } from './plan.js';
import { checkReport, humanReport, nextSteps, type InitReport } from './report.js';
import { verifySite } from './site.js';

/** What init talks to: streams, the terminal, the environment and (tests) fetch. */
export interface InitIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: NodeJS.ProcessEnv;
  cwd: string;
  /** Asks a question on the terminal; absent when there is none. */
  ask?: (question: string) => Promise<string>;
  fetch?: typeof fetch;
}

class NeedsInput extends Error {}

const NEEDS_URL = "Give the site's live URL: npx @foliwake/next init --url https://my-site.example.org";

async function urlOf(opts: InitOptions, io: InitIo): Promise<string> {
  if (opts.url) return opts.url;
  if (opts.yes || !io.ask) throw new NeedsInput(NEEDS_URL);
  const answer = (await io.ask("The site's live URL (https://…): ")).trim();
  if (!answer) throw new NeedsInput(NEEDS_URL);
  return answer;
}

function projectWarnings(project: Project): string[] {
  const warnings: string[] = [];
  if (supportsNext(project.nextVersion) === null) {
    warnings.push(`Next ${project.nextVersion ?? '(unknown)'}: cannot tell its version; 16.2 or newer is needed.`);
  }
  if (!project.hasFoliwakeNext) warnings.push(`Install the package: ${project.packageManager} add @foliwake/next`);
  if (project.gitClean === null) warnings.push('Not a git checkout: review the changes by hand.');
  return warnings;
}

function checkProject(project: Project, opts: InitOptions): void {
  if (supportsNext(project.nextVersion) === false) {
    throw new InitError(`Next ${project.nextVersion} is too old: @foliwake/next needs Next 16.2 or newer.`);
  }
  if (project.gitClean === false && !opts.ignoreGitChanges && !opts.dryRun) {
    throw new InitError('The git working tree has uncommitted changes: commit them, or pass --ignore-git-changes.');
  }
}

async function runCheck(project: Project, opts: InitOptions, io: InitIo): Promise<number> {
  const checks = await checkSetup(project, io.env, io.fetch);
  io.stdout(opts.json ? `${JSON.stringify({ ok: checks.every((c) => c.ok), checks })}\n` : checkReport(checks));
  return checks.every((c) => c.ok) ? 0 : 1;
}

async function runSetup(project: Project, opts: InitOptions, io: InitIo): Promise<number> {
  const mount = checkMount(opts.mount ?? undefined);
  checkProject(project, opts);
  const facts = await verifySite(await urlOf(opts, io), io.fetch);
  const choices = { url: facts.url, preview: opts.preview, hook: opts.hook, mount };
  const steps = applySteps(planSteps(project, choices), { cwd: project.cwd, dryRun: opts.dryRun, force: opts.force });
  const report: InitReport = {
    ok: !steps.some((step) => step.outcome === 'manual'),
    dryRun: opts.dryRun,
    site: facts.site,
    url: facts.url,
    blocks: facts.blocks,
    steps,
    warnings: [...projectWarnings(project), ...(facts.note ? [facts.note] : [])],
    next: nextSteps(facts.site, choices),
  };
  io.stdout(opts.json ? `${JSON.stringify(report)}\n` : humanReport(report, facts));
  return 0;
}

function failure(error: unknown, io: InitIo, json: boolean): number {
  const code = error instanceof NeedsInput ? 2 : 1;
  const message = (error as Error).message;
  io.stderr(`${json ? JSON.stringify({ ok: false, error: message }) : `✗ ${message}`}\n`);
  return code;
}

/** Runs init with `argv` (the words after the program). Returns the exit code. */
export async function runInit(argv: string[], io: InitIo): Promise<number> {
  let opts: InitOptions;
  try {
    opts = parseOptions(argv, io.env, io.cwd);
  } catch (error) {
    if (error instanceof UsageError) return failure(error, io, false);
    throw error;
  }
  if (opts.command === 'help') {
    io.stdout(`${USAGE}\n`);
    return 0;
  }
  try {
    const project = detectProject(opts.cwd);
    return opts.check ? await runCheck(project, opts, io) : await runSetup(project, opts, io);
  } catch (error) {
    return failure(error, io, opts.json);
  }
}
