// Page templates: what a code release says about its templates, and the rules a page must follow. Shared by
// the site code check, code preparation, publication and delivery, so all of them apply one rule set.
// Pure: no store, no clock.
import { compileGlob, globMatches, globProblem } from './query.js';

/** The generated registry at the code release root, next to shell.json. */
export const TEMPLATES_FILE = 'templates.json';
export const TEMPLATES_SCHEMA = 'foliwake-templates/1';
export const TEMPLATE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** templates/<name>/<name>.json as the site wrote it. */
export interface TemplateDefinition {
  label: string;
  /**
   * Optional guard: the page paths the template may be used on (TEMPLATE_PATH outside them). Never
   * chooses a template for a page: only the page's own `template` does. Absent: any path.
   */
  paths?: string[];
  /** Absent: every site block is allowed. Empty: none is. */
  blocks?: string[];
}

/** A definition plus which of its stylesheet and script exist. */
export interface TemplateRecord extends TemplateDefinition {
  css: boolean;
  js: boolean;
}

export interface TemplateRegistry {
  schema: typeof TEMPLATES_SCHEMA;
  templates: Record<string, TemplateRecord>;
}

export type TemplateCode = 'TEMPLATE_UNKNOWN' | 'TEMPLATE_PATH' | 'TEMPLATE_BLOCK';

export interface TemplateProblem {
  code: TemplateCode;
  message: string;
  fix: string;
  /** TEMPLATE_BLOCK: the block that is not allowed. */
  block?: string;
}

const DEFINITION_KEYS: readonly string[] = ['label', 'paths', 'blocks'];
const RECORD_KEYS: readonly string[] = [...DEFINITION_KEYS, 'css', 'js'];
const REGISTRY_KEYS: readonly string[] = ['schema', 'templates'];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function unknownKeyProblems(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  return unknown.map((key) => `Unknown key "${key}". Allowed keys: ${allowed.join(', ')}.`);
}

function fieldProblems(value: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (typeof value.label !== 'string' || value.label === '') {
    problems.push('"label" must be a non-empty string.');
  }
  // `paths` left out: no guard, the template may be used on any path.
  const paths = value.paths;
  if (paths !== undefined && (!isStringList(paths) || paths.length === 0)) {
    problems.push('"paths" must be a non-empty list of path globs, or left out for any path.');
  } else if (paths !== undefined) {
    for (const glob of paths) {
      const problem = globProblem(glob);
      if (problem !== null) problems.push(`"paths": ${JSON.stringify(glob)} ${problem}.`);
    }
  }
  if (value.blocks !== undefined && !isStringList(value.blocks)) {
    problems.push('"blocks" must be a list of block names.');
  }
  return problems;
}

/** Reads a parsed templates/<name>/<name>.json; `definition` is null when there is any problem. */
export function parseTemplateDefinition(value: unknown): { definition: TemplateDefinition | null; problems: string[] } {
  if (!isObject(value)) return { definition: null, problems: ['A template definition must be a JSON object.'] };
  const problems = [...unknownKeyProblems(value, DEFINITION_KEYS), ...fieldProblems(value)];
  if (problems.length > 0) return { definition: null, problems };
  return { definition: value as unknown as TemplateDefinition, problems };
}

function recordProblems(name: string, value: unknown): string[] {
  if (!TEMPLATE_NAME_PATTERN.test(name)) return [`Invalid template name "${name}".`];
  if (!isObject(value)) return [`Template "${name}" must be an object.`];
  const problems = [...unknownKeyProblems(value, RECORD_KEYS), ...fieldProblems(value)];
  if (typeof value.css !== 'boolean' || typeof value.js !== 'boolean') {
    problems.push('"css" and "js" must be booleans.');
  }
  return problems.map((problem) => `${name}: ${problem}`);
}

/** Reads a stored registry file; `registry` is null when there is any problem. */
export function parseTemplateRegistry(text: string): { registry: TemplateRegistry | null; problems: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { registry: null, problems: [`Not valid JSON: ${(error as Error).message}.`] };
  }
  if (!isObject(value)) return { registry: null, problems: ['The registry must be a JSON object.'] };
  const problems = unknownKeyProblems(value, REGISTRY_KEYS);
  if (value.schema !== TEMPLATES_SCHEMA) problems.push(`"schema" must be "${TEMPLATES_SCHEMA}".`);
  if (!isObject(value.templates)) {
    problems.push('"templates" must be an object.');
    return { registry: null, problems };
  }
  for (const [name, record] of Object.entries(value.templates)) {
    problems.push(...recordProblems(name, record));
  }
  if (problems.length > 0) return { registry: null, problems };
  return { registry: value as unknown as TemplateRegistry, problems };
}

function templateRecord(name: string, registry: TemplateRegistry | null): TemplateRecord | null {
  if (registry === null || !Object.hasOwn(registry.templates, name)) return null;
  return registry.templates[name];
}

function pathsMatch(paths: readonly string[], pagePath: string): boolean {
  return paths.some((glob) => globMatches(compileGlob(glob), pagePath));
}

function unknownTemplateFix(template: string, known: readonly string[]): string {
  const definition = `templates/${template}/${template}.json`;
  return `Use one of its templates (${known.join(', ') || 'none'}), or add ${definition} to the site code.`;
}

/**
 * The TEMPLATE_UNKNOWN or TEMPLATE_PATH problem of a page, if it has one. A page that names no template
 * has none: a template's `paths` never assigns or requires it.
 */
export function templatePathProblem(
  { path, template }: { path: string; template: string | null },
  registry: TemplateRegistry | null,
): TemplateProblem | null {
  if (template === null) return null;
  const record = templateRecord(template, registry);
  if (record === null) {
    const known = registry === null ? [] : Object.keys(registry.templates).sort();
    return {
      code: 'TEMPLATE_UNKNOWN',
      message: `The code release has no template ${JSON.stringify(template)}.`,
      fix: unknownTemplateFix(template, known),
    };
  }
  if (record.paths !== undefined && !pathsMatch(record.paths, path)) {
    return {
      code: 'TEMPLATE_PATH',
      message: `Page path ${path} does not match the paths of template "${template}" (${record.paths.join(', ')}).`,
      fix: 'Move the page, choose another template, or widen the paths of this template.',
    };
  }
  return null;
}

/** One TEMPLATE_BLOCK problem per site block the page's template does not allow. */
export function templateBlockProblems(
  template: string | null,
  blocks: readonly string[],
  registry: TemplateRegistry | null,
): TemplateProblem[] {
  if (template === null) return [];
  const allowed = templateRecord(template, registry)?.blocks;
  if (allowed === undefined) return [];
  return blocks
    .filter((block) => !allowed.includes(block))
    .map((block) => ({
      code: 'TEMPLATE_BLOCK',
      block,
      message: `Template "${template}" does not allow block "${block}" (allowed: ${allowed.join(', ') || 'none'}).`,
      fix: 'Remove the block, choose another template, or add the block to the blocks of this template.',
    }));
}

/** What the template rules read of a release entry: its recorded template and block names. */
export interface TemplatedEntry {
  metadata?: { template?: string | null; blocks?: Readonly<Record<string, unknown>> | null } | null;
}

/** All three checks over one release entry: its path, recorded template and recorded block names. */
export function entryTemplateProblems(
  path: string,
  entry: TemplatedEntry,
  registry: TemplateRegistry | null,
): TemplateProblem[] {
  const template = entry.metadata?.template ?? null;
  const blocks = Object.keys(entry.metadata?.blocks ?? {});
  const pathProblem = templatePathProblem({ path, template }, registry);
  const blockProblems = templateBlockProblems(template, blocks, registry);
  return pathProblem === null ? blockProblems : [pathProblem, ...blockProblems];
}

/**
 * The template the page shell applies: declared by the registry and with a name that is
 * safe in a URL and an attribute. `registry` is whatever was read, so anything that is
 * not such an object gives none.
 */
export function pageTemplate(name: unknown, registry: unknown): { name: string; css: boolean; js: boolean } | null {
  if (typeof name !== 'string' || !TEMPLATE_NAME_PATTERN.test(name) || !isObject(registry)) return null;
  const templates = registry.templates;
  if (!isObject(templates) || !Object.hasOwn(templates, name)) return null;
  const record = templates[name];
  if (!isObject(record)) return null;
  return { name, css: record.css === true, js: record.js === true };
}
