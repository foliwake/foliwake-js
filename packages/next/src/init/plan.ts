// What init will do, computed before anything is written: the files, the env lines and the next.config change.
import path from 'node:path';
import type { Project } from './detect.js';
import { isAuthorFile, livePageFile, nextConfigFile, previewPageFile, routeFile } from './templates.js';

/** One step of the plan. */
export type Step =
  | { kind: 'file'; path: string; content: string; what: string }
  | { kind: 'env'; path: string; lines: string[]; onlyIfExists: boolean; what: string }
  | { kind: 'next-config'; path: string; create: string | null; what: string };

/** The choices init works with. */
export interface PlanInput {
  url: string;
  preview: boolean;
  hook: boolean;
  /** `/pages`, or null for the root. */
  mount: string | null;
}

const posix = path.posix;

/** The author check module, without its extension (as imports name it). */
function helperModule(project: Project): string {
  return posix.join(project.sourceDir, 'foliwake', 'is-author');
}

/** The relative import of the author check from a file of the app. */
function authorImportFrom(project: Project, file: string): string {
  return posix.relative(posix.dirname(file), helperModule(project));
}

function pageDir(mount: string | null): string {
  return mount === null ? '[...path]' : posix.join(mount.slice(1), '[[...path]]');
}

function envLines(input: PlanInput): string[] {
  return [
    `FOLIWAKE_URL=${input.url}`,
    ...(input.preview ? ['FOLIWAKE_PREVIEW_TOKEN='] : []),
    ...(input.hook ? ['FOLIWAKE_HOOK_SECRET='] : []),
  ];
}

function fileStep(file: string, content: string, what: string): Step {
  return { kind: 'file', path: file, content, what };
}

function routeStep(project: Project, input: PlanInput): Step {
  const file = posix.join(project.appDir, 'foliwake/[...path]', `route.${project.lang}`);
  const author = input.preview ? authorImportFrom(project, file) : null;
  return fileStep(file, routeFile(author), 'code, media and hook routes');
}

function pageExtension(project: Project): string {
  return project.lang === 'ts' ? 'tsx' : 'jsx';
}

function livePageStep(project: Project, input: PlanInput): Step {
  const file = posix.join(project.appDir, pageDir(input.mount), `page.${pageExtension(project)}`);
  return fileStep(file, livePageFile(input.mount), 'site pages (your own routes win)');
}

function previewSteps(project: Project): Step[] {
  const page = posix.join(project.appDir, 'preview/[[...path]]', `page.${pageExtension(project)}`);
  const helper = `${helperModule(project)}.${project.lang}`;
  return [
    fileStep(page, previewPageFile(authorImportFrom(project, page)), 'preview pages, behind isAuthor()'),
    fileStep(helper, isAuthorFile(project.lang), 'isAuthor(): development only; replace it with your sign-in'),
  ];
}

function configStep(project: Project): Step {
  if (project.nextConfig !== null) {
    return { kind: 'next-config', path: project.nextConfig, create: null, what: 'wrapped in withFoliwake()' };
  }
  const file = project.lang === 'ts' ? 'next.config.ts' : 'next.config.mjs';
  return { kind: 'next-config', path: file, create: nextConfigFile(), what: 'withFoliwake({ cacheComponents: true })' };
}

/** Every step, in the order they are printed. */
export function planSteps(project: Project, input: PlanInput): Step[] {
  const lines = envLines(input);
  return [
    { kind: 'env', path: '.env.local', lines, onlyIfExists: false, what: 'FOLIWAKE_URL (secrets: names only)' },
    { kind: 'env', path: '.env.example', lines, onlyIfExists: true, what: 'the same names' },
    configStep(project),
    routeStep(project, input),
    livePageStep(project, input),
    ...(input.preview ? previewSteps(project) : []),
  ];
}
