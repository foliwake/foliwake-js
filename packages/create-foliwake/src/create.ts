// create-foliwake: a new site frontend: blocks, styles, local sample pages, checks and workflows.
//
// Order, so that nothing is written unless everything before it held:
//   1. flag values checked;
//   2. answers: flags first; in a terminal, questions for what is missing; otherwise defaults (Ctrl+C in a
//      question: "cancelled", exit 130);
//   3. the destination checked (destination.ts: never Git metadata, never through a link, never over another
//      repository) and the files planned in memory from the starters;
//   4. @foliwake/site-check over the planned files (validate.ts);
//   5. the files written as one transaction: on any failure nothing of this run stays, and with --overwrite the
//      original files are put back; then the files for editors (git-ignored: the JSON Schema of block
//      definitions, the types of `foliwake`);
//   6. the npm packages installed, when the project has some (Storybook) and that was asked;
//   7. `git init` and the first commit (when asked; never inside another repository, and not when that cannot
//      be determined).
// Exit status: 0 created; 1 failure (also a failed or skipped-for-doubt Git step: the project stays);
// 2 refused input; 130 cancelled.
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';

import { cancel } from '@clack/prompts';

import { nestedRepositories, pathProblems, resolveDestination, writeProject } from './destination.js';
import { type ProjectFile, projectFiles } from './files.js';
import { INITIAL_BRANCH, enclosingRepository, initAndCommit } from './git.js';
import { type PackageManager, installPackages, packageManagerOf } from './install.js';
import {
  type CreateAnswers,
  CreateCancelled,
  type CreateRequest,
  CreateUsageError,
  DEFAULT_FOLDER,
  DEFAULT_TEMPLATE,
  folderProblem,
  siteIdProblem,
  templateProblem,
} from './options.js';
import {
  type PromptStreams,
  askExisting,
  askFolder,
  askGit,
  askInstall,
  askReact,
  askStorybook,
  askTemplate,
  welcome,
} from './prompts.js';
import { writeKitTypes, writeLocalSchema } from './editor-files.js';
import { packageVersion, siteCheckVersion } from './starters.js';
import { projectProblems } from './validate.js';

export const EXIT_CANCELLED = 130;

export interface CreateIO {
  cwd: string;
  stdin: Readable & { isTTY?: boolean };
  stdout: Writable & { isTTY?: boolean };
  stderr: Writable;
  env: NodeJS.ProcessEnv;
  /** Prompt streams (default stdin/stdout); tests supply their own. */
  prompts?: PromptStreams;
}

/** What a run did: enough for the report, and for a wrapper (the Foliwake CLI) to add its own steps. */
export interface CreateResult {
  /** 0 created; 1 created with a failed step, or refused by its own check (nothing written); 130 cancelled */
  status: number;
  /** false when nothing was written (cancelled, or the starters failed their check) */
  created: boolean;
  answers: (CreateAnswers & { target: string }) | null;
  /** the folder as the user should type it (`cd …`) */
  shown: string;
  /** the project's files (project paths) */
  files: string[];
  /** true when this run made the repository and its first commit */
  committed: boolean;
  /** the report: what was checked and created, the Git result, notes */
  report: string[];
  /** what to do by hand after a failed or skipped Git step (stderr) */
  help: string | null;
}

/** The nearest existing folder at or above `target` (where Git discovery starts before the folder exists). */
function nearestExisting(target: string): string {
  for (let at = target; ; at = path.dirname(at)) {
    if (existsSync(at) || path.dirname(at) === at) return at;
  }
}

function checkRequest(request: CreateRequest): void {
  const problem =
    (request.folder !== undefined ? folderProblem(request.folder) : null) ??
    (request.template !== undefined ? templateProblem(request.template) : null) ??
    (request.site ? siteIdProblem(request.site) : null);
  if (problem) throw new CreateUsageError(problem);
}

/** A path as a shell word (quoted only when needed). */
export function shellWord(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

const listed = (items: readonly string[], max: number) =>
  `${items.slice(0, max).join(', ')}${items.length > max ? ', …' : ''}`;

function notEmptyProblem(folder: string, entries: readonly string[]): CreateUsageError {
  const choices =
    'pass --overwrite to remove its files (.git is kept) or --keep-existing to add the project next to them';
  return new CreateUsageError(`${folder} is not empty (${listed(entries, 4)}). Choose a new folder, or ${choices}.`);
}

async function answer(
  request: CreateRequest,
  io: CreateIO,
  interactive: boolean,
): Promise<CreateAnswers & { target: string }> {
  const prompts = io.prompts ?? { input: io.stdin, output: io.stdout };
  const ask = <T>(given: T | undefined, question: () => Promise<T>, fallback: T): Promise<T> | T =>
    given !== undefined ? given : interactive ? question() : fallback;
  if (interactive) welcome(prompts);
  const folder = await ask(request.folder, () => askFolder(prompts), DEFAULT_FOLDER);
  const { target, state } = await resolveDestination(io.cwd, folder);
  let existing = null;
  if (state.kind === 'files') {
    existing = await ask(request.existing, () => askExisting(prompts, folder, state.entries), null);
    if (existing === null) throw notEmptyProblem(folder, state.entries);
  }
  const template = await ask(request.template, () => askTemplate(prompts), DEFAULT_TEMPLATE);
  const siteId = request.site ? request.site : null;
  const react = await ask(request.react, () => askReact(prompts), false);
  const storybook = await ask(request.storybook, () => askStorybook(prompts), false);
  const manager = packageManagerOf(io.env);
  const install = storybook ? await ask(request.install, () => askInstall(prompts, manager), false) : false;
  const git = await ask(request.git, () => askGit(prompts), true);
  return { folder, target, template, siteId, git, react, storybook, install, existing };
}

async function placementProblems(
  answers: CreateAnswers & { target: string },
  files: readonly ProjectFile[],
): Promise<void> {
  const { folder, target, existing } = answers;
  if (existing === 'keep') {
    const { taken, unsafe } = await pathProblems(
      target,
      files.map((file) => file.path),
    );
    if (unsafe.length) {
      throw new CreateUsageError(
        `${folder} has ${listed(unsafe, 6)} where the project needs a real folder (a symbolic link or a file); ` +
          'nothing is written through links. Nothing was written.',
      );
    }
    if (taken.length) {
      throw new CreateUsageError(
        `${folder} already has ${listed(taken, 6)}; kept files are never replaced. Nothing was written. ` +
          'Use --overwrite to remove the existing files, or another folder.',
      );
    }
  }
  if (existing === 'clear') {
    const repositories = await nestedRepositories(target);
    if (repositories.length) {
      throw new CreateUsageError(
        `${folder} contains Git repositories (${listed(repositories, 6)}); --overwrite never removes a repository. ` +
          'Move them out or choose another folder. Nothing was changed.',
      );
    }
  }
}

function shownFolder(io: CreateIO, folder: string, target: string): string {
  const relative = path.relative(io.cwd, path.resolve(io.cwd, folder));
  return relative === '' ? '.' : relative.startsWith('..') ? target : relative;
}

interface GitStep {
  line: string;
  help: string | null;
  failed: boolean;
  committed: boolean;
}

function firstCommitHelp(others: boolean, files: readonly string[]): string {
  const stage = others ? `git add -- ${files.map(shellWord).join(' ')}` : 'git add -A';
  const only = others ? " (only the project's files; the other files in the folder stay out)" : '';
  const commit = '`git commit -m "Create the site"`';
  return `run \`git init -b ${INITIAL_BRANCH}\`, \`${stage}\`${only} and ${commit} in the folder.`;
}

async function gitStep(
  answers: CreateAnswers & { target: string },
  files: readonly string[],
  others: boolean,
  io: CreateIO,
  version: string,
): Promise<GitStep> {
  const { folder, target, template } = answers;
  const skipped = (line: string): GitStep => ({ line, help: null, failed: false, committed: false });
  if (!answers.git)
    return skipped('Git: skipped. The platform takes code from commits: run `git init` and commit when you are ready.');
  const repository = await enclosingRepository(nearestExisting(target), io.env);
  if (repository.kind === 'inside') {
    return skipped(
      `Git: ${folder} is inside the repository ${repository.top}; no repository was created and nothing was ` +
        'committed. Review and commit the new files there.',
    );
  }
  if (repository.kind === 'unknown') {
    const check = `Check with \`git -C ${shellWord(folder)} rev-parse --show-toplevel\`.`;
    return {
      line:
        `Git: skipped: could not tell whether ${folder} is inside another repository (${repository.reason}), ` +
        'so no repository was created and nothing was committed.',
      help: `${check} Inside a repository: commit the new files there. Otherwise ${firstCommitHelp(others, files)}`,
      failed: true,
      committed: false,
    };
  }
  const message = `Create the site with create-foliwake ${version} (template ${template})`;
  const commit = await initAndCommit(target, files, message, io.env);
  if (commit.ok) {
    const line = `Git: new repository (branch ${INITIAL_BRANCH}), first commit ${commit.sha.slice(0, 7)}.`;
    return { line, help: null, failed: false, committed: true };
  }
  const identity =
    "The project's files are staged (nothing else). Fix the problem above (for a missing identity: " +
    '`git config --global user.name …` and `user.email …`), then run `git commit -m "Create the site"` in the folder.';
  const help = commit.step === 'commit' ? identity : `Fix the problem above, then ${firstCommitHelp(others, files)}`;
  return { line: `Git: FAILED at \`git ${commit.step}\`: ${commit.reason}`, help, failed: true, committed: false };
}

async function installStep(target: string, manager: PackageManager, io: CreateIO): Promise<string> {
  const result = await installPackages(target, manager, io.env);
  if (result.ok) return `Installed the npm packages with ${manager}.`;
  return `Install FAILED (${result.reason}); run \`${manager} install\` in the folder.`;
}

const nothingCreated = (status: number, report: string[]): CreateResult => ({
  status,
  created: false,
  answers: null,
  shown: '',
  files: [],
  committed: false,
  report,
  help: null,
});

/**
 * Creates the project; resolves to what it did (create-foliwake prints it with printResult, a wrapper may add
 * its own steps first). Throws CreateUsageError for refused input (nothing was written).
 */
export async function createProject(request: CreateRequest, io: CreateIO): Promise<CreateResult> {
  checkRequest(request);
  const interactive = request.interactive ?? (io.stdin.isTTY === true && io.stdout.isTTY === true);
  let answers: CreateAnswers & { target: string };
  try {
    answers = await answer(request, io, interactive);
  } catch (error) {
    if (!(error instanceof CreateCancelled)) throw error;
    if (interactive) cancel(error.message, io.prompts ?? { input: io.stdin, output: io.stdout });
    return nothingCreated(EXIT_CANCELLED, interactive ? [] : [error.message]);
  }
  const version = await packageVersion();
  const files = await projectFiles({ ...answers });
  await placementProblems(answers, files);
  const problems = await projectProblems(files);
  if (problems.length) {
    const template = `The ${answers.template} template of create-foliwake ${version}`;
    const head = `${template} fails its own checks, so nothing was written. Please report this:`;
    return nothingCreated(1, [head, ...problems.map((problem) => `  ${problem}`)]);
  }

  const written = await writeProject(answers.target, files, answers.existing);
  const notes: string[] = [];
  let status = 0;
  await writeLocalSchema(answers.target).catch((error: Error) => {
    notes.push(`The JSON Schema for editors was not written (${error.message}); \`foliwake dev\` writes it.`);
  });
  await writeKitTypes(answers.target).catch((error: Error) => {
    notes.push(
      `The types of \`foliwake\` for editors were not written (${error.message}); \`foliwake dev\` writes them.`,
    );
  });
  if (written.leftover) {
    status = 1;
    notes.push(
      `Cleanup incomplete: the project was created, but some of the replaced files could not be deleted ` +
        `(${written.leftover.reason}); they are in ${written.leftover.folder}. ` +
        'Delete that folder yourself; it is not committed.',
    );
  }
  if (answers.install) notes.push(await installStep(answers.target, packageManagerOf(io.env), io));
  const paths = files.map((file) => file.path);
  const others = answers.existing === 'keep' || written.leftover !== null;
  const git = await gitStep(answers, paths, others, io, version);
  if (git.failed) status = 1;

  const shown = shownFolder(io, answers.folder, answers.target);
  const extras = [answers.react ? ', React' : '', answers.storybook ? ', Storybook' : ''].join('');
  const options = `template ${answers.template}${extras}`;
  const site = answers.siteId ? `, site id ${answers.siteId}` : '';
  const report = [
    `Checked with @foliwake/site-check ${await siteCheckVersion()}: no problems.`,
    `Created ${shown} (${options}, create-foliwake ${version}${site}).`,
    git.line,
    ...notes,
  ];
  return { status, created: true, answers, shown, files: paths, committed: git.committed, report, help: git.help };
}

/** The «Next» steps after a project is created. */
export function nextSteps(result: CreateResult): string[] {
  const steps = ['Next:'];
  if (result.shown !== '.') steps.push(`  cd ${shellWord(result.shown)}`);
  steps.push(
    '  npx @foliwake/site-check            re-check after every change; the platform runs the same checks',
    '  Push the repository to GitHub and connect it to your site in the Foliwake admin ' +
      '(README.md, "Connect to Foliwake"):',
    "    every branch gets a preview with the site's content; " +
      "a merge to main goes to the site's preview, then Release in the admin.",
    '  Local preview and page checks need the Foliwake CLI (Docker image or Foliwake Cloud): foliwake dev --watch',
  );
  if (result.answers?.storybook && !result.answers.install)
    steps.push('  npm install   (Storybook; `npm run stories` needs the Foliwake CLI)');
  return steps;
}

/** Prints the report (and the Next steps of a created project). */
export function printResult(result: CreateResult, io: Pick<CreateIO, 'stdout' | 'stderr'>): void {
  const out = (text = '') => io.stdout.write(`${text}\n`);
  const err = (text = '') => io.stderr.write(`${text}\n`);
  if (!result.created) {
    for (const line of result.report) err(line);
    return;
  }
  out();
  for (const line of result.report) out(line);
  if (result.help) err(`The project files are complete and checked. ${result.help}`);
  out();
  for (const line of nextSteps(result)) out(line);
}

/** Runs create-foliwake; resolves to the exit status. Throws CreateUsageError for refused input. */
export async function runCreate(request: CreateRequest, io: CreateIO): Promise<number> {
  const result = await createProject(request, io);
  printResult(result, io);
  return result.status;
}
