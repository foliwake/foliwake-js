// Carries out a plan, or (dry run) says what it would do. Never overwrites a file it did not generate; adds only
// env names that are missing; edits next.config once.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  addCacheComponents,
  CACHE_COMPONENTS_LINE,
  editNextConfig,
  MANUAL_STEPS,
  type CacheEdit,
} from './next-config.js';
import type { Step } from './plan.js';
import { GENERATED } from './templates.js';

/** What happened to one step. */
export type Outcome = 'created' | 'updated' | 'exists' | 'skipped' | 'manual';

/** One line of the report. */
export interface StepResult {
  path: string;
  outcome: Outcome;
  what: string;
  /** Why it was skipped or must be done by hand, or a warning. */
  note?: string;
}

/** How to apply. */
export interface ApplyOptions {
  cwd: string;
  dryRun: boolean;
  force: boolean;
}

const ENV_NAME = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm;

function read(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function write(file: string, text: string, opts: ApplyOptions): void {
  if (opts.dryRun) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function applyFile(step: Extract<Step, { kind: 'file' }>, opts: ApplyOptions): StepResult {
  const file = path.join(opts.cwd, step.path);
  const current = read(file);
  const base = { path: step.path, what: step.what };
  if (current === step.content) return { ...base, outcome: 'exists' };
  if (current !== null && !(opts.force && current.startsWith(GENERATED))) {
    const note = current.startsWith(GENERATED) ? 'exists; --force rewrites it' : 'exists and is yours; left alone';
    return { ...base, outcome: 'skipped', note };
  }
  write(file, step.content, opts);
  return { ...base, outcome: current === null ? 'created' : 'updated' };
}

function envNames(text: string): Set<string> {
  return new Set([...text.matchAll(ENV_NAME)].map((match) => match[1]!));
}

function applyEnv(step: Extract<Step, { kind: 'env' }>, opts: ApplyOptions): StepResult | null {
  const file = path.join(opts.cwd, step.path);
  const current = read(file);
  if (current === null && step.onlyIfExists) return null;
  const known = envNames(current ?? '');
  const missing = step.lines.filter((line) => !known.has(line.split('=')[0]!));
  const base = { path: step.path, what: step.what };
  if (missing.length === 0) return { ...base, outcome: 'exists' };
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  write(file, `${current ?? ''}${separator}${missing.join('\n')}\n`, opts);
  return { ...base, outcome: current === null ? 'created' : 'updated', note: missing.map(nameOf).join(', ') };
}

const nameOf = (line: string): string => line.split('=')[0]!;

const CACHE_WHAT = 'cacheComponents: true (the page route needs it)';

function cacheStep(file: string, cache: CacheEdit): StepResult {
  const base = { path: file, what: CACHE_WHAT };
  if (cache.kind === 'manual') {
    return { ...base, outcome: 'manual', note: `${cache.reason}; add \`${CACHE_COMPONENTS_LINE}\` to the config` };
  }
  return { ...base, outcome: cache.kind === 'added' ? 'updated' : 'exists' };
}

// Two results: the withFoliwake() wrap, then cacheComponents; the file is written once, when either changed it.
function applyConfig(step: Extract<Step, { kind: 'next-config' }>, opts: ApplyOptions): StepResult[] {
  const file = path.join(opts.cwd, step.path);
  const base = { path: step.path, what: step.what };
  if (step.create !== null) {
    write(file, step.create, opts);
    return [{ ...base, outcome: 'created' }];
  }
  const original = readFileSync(file, 'utf8');
  const wrap = editNextConfig(original, step.path);
  if (wrap.kind === 'manual') {
    return [{ ...base, outcome: 'manual', note: `${wrap.reason}. ${MANUAL_STEPS.join(' ')}` }];
  }
  const wrapped = wrap.kind === 'wrapped' ? wrap.text : original;
  const cache = addCacheComponents(wrapped);
  const final = cache.kind === 'added' ? cache.text : wrapped;
  if (final !== original) write(file, final, opts);
  return [{ ...base, outcome: wrap.kind === 'present' ? 'exists' : 'updated' }, cacheStep(step.path, cache)];
}

/** Applies every step in order. */
export function applySteps(steps: readonly Step[], opts: ApplyOptions): StepResult[] {
  const results: StepResult[] = [];
  for (const step of steps) {
    if (step.kind === 'file') results.push(applyFile(step, opts));
    else if (step.kind === 'next-config') results.push(...applyConfig(step, opts));
    else {
      const result = applyEnv(step, opts);
      if (result) results.push(result);
    }
  }
  return results;
}
