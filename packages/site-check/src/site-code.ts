// The site code as the platform reads it: a block is one folder `components/<name>/` with `<name>.json` (its
// definition), `<name>.css` and optionally `<name>.js`. The block pack is assembled from the definitions and
// the component descriptor generated from the files present; a hand-written `components/components.json` still
// wins when a site has one (sites from before this layout). A page template is one folder `templates/<name>/`
// with `<name>.json` and optionally `<name>.css` and `<name>.js`; the registry is assembled from them.
//
// One reading for every caller: a working folder and the captured files of a code release both go through
// siteCodeOf(), so a release holds exactly what the local check accepted.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { EDITOR_CONFIG_FILE, parseEditorConfig } from './blocks/editor-config.js';
import { exampleFileOf, parseExampleFile } from './blocks/examples.js';
import { type BlockPack, PACK_SCHEMA, type PackIssue, SECTION_METADATA_BLOCK, parsePack } from './blocks/pack.js';
import { extensionOf, isCodeExtension } from './formats/code-files.js';
import { HTML_CONTRACT } from './formats/constants.js';
import { DESCRIPTOR_PATH } from './formats/descriptor.js';
import { type Diagnostic, makeDiagnostic } from './formats/diagnostics.js';
import { jsonPointerPosition } from './formats/json-position.js';
import type { BlocksEntry } from './formats/blocks-entry.js';
import { SITE_FILE, type SiteConfig, parseSiteConfig } from './formats/site-config.js';
import {
  TEMPLATES_SCHEMA,
  TEMPLATE_NAME_PATTERN,
  type TemplateRecord,
  type TemplateRegistry,
  parseTemplateDefinition,
} from './formats/templates.js';
import {
  REFERENCES_ROOT,
  type ReferenceIssue,
  type ReferenceTables,
  readReferenceTables,
} from './references/tables.js';

const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const TEMPLATES_ROOT = 'templates';

export interface SiteDescriptor {
  htmlContract: number;
  /** The blocks module an embedding app loads (from site.yaml `blocks`, for a generated descriptor) */
  blocks?: BlocksEntry;
  /** `ui`: the block's labels (its definition's `ui`), given to its init as `meta.ui` by the loader */
  components: Record<
    string,
    { css: boolean; js: boolean; ui?: Readonly<Record<string, Readonly<Record<string, string>>>> }
  >;
}

/** A problem of a site code file while it is read; siteCodeOf() gives it as a Diagnostic. */
interface SiteCodeIssue {
  code:
    | PackIssue['code']
    | ReferenceIssue['code']
    | 'TEMPLATE_DEFINITION_INVALID'
    | 'SITE_CONFIG_INVALID'
    | 'BLOCK_PRESET_UNKNOWN'
    | 'EDITOR_CONFIG_INVALID'
    | 'CODE_FOLDER_NAME_INVALID';
  /** JSON pointer into a JSON file; a YAML field path for site.yaml */
  pointer: string;
  message: string;
  fix: string | null;
  file: string;
  /** the position, when the reader knows it (YAML); else the pointer's position in the file */
  line?: number;
  column?: number;
}

export interface SiteCode {
  /** null when no block folder has a definition */
  pack: BlockPack | null;
  /** the parsed definitions by block name (the pack's `blocks`); null with `pack` */
  definitions: Record<string, unknown> | null;
  /** problems of the definitions, templates, site.yaml, editor.json and reference tables, sorted */
  diagnostics: Diagnostic[];
  /** the descriptor the loader receives */
  descriptor: SiteDescriptor | null;
  /** true when the engine generated it (no hand-written components.json) */
  generated: boolean;
  /** the templates with a valid definition; null when there are none */
  templates: TemplateRegistry | null;
  /** the `authoring` of site.yaml; null with no file, no key or an invalid file */
  authoringDefault: string | null;
  /** the valid inline reference tables by kind (`references/<kind>.json`, references.ts); null when there are none */
  references: ReferenceTables | null;
}

/** Read access to a code root: the working directory or a release's captured files. */
export interface CodeTree {
  /** names of the folders directly under components/ */
  componentFolders(): Promise<string[]>;
  /** paths of the files under templates/ that site code may have (no hidden paths) */
  templateFiles(): Promise<string[]>;
  /** paths of the files directly under references/ (`references/<name>`) */
  referenceFiles(): Promise<string[]>;
  isFile(relative: string): Promise<boolean>;
  readText(relative: string): Promise<string>;
  readBytes(relative: string): Promise<Uint8Array>;
}

// The same files a code release would capture from this folder (git.ts isCodeInput).
async function listTemplateFiles(codeRoot: string, relative: string): Promise<string[]> {
  const entries = await readdir(path.join(codeRoot, relative), { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await listTemplateFiles(codeRoot, child)));
    else if (entry.isFile() && isCodeExtension(extensionOf(entry.name))) found.push(child);
  }
  return found;
}

/** The working directory as a code tree. */
export function directoryTree(codeRoot: string): CodeTree {
  const absolute = (relative: string) => path.join(codeRoot, ...relative.split('/'));
  return {
    async componentFolders() {
      const entries = await readdir(path.join(codeRoot, 'components'), { withFileTypes: true }).catch(() => []);
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    },
    templateFiles: () => listTemplateFiles(codeRoot, TEMPLATES_ROOT),
    async referenceFiles() {
      const entries = await readdir(path.join(codeRoot, REFERENCES_ROOT), { withFileTypes: true }).catch(() => []);
      return entries.filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => `${REFERENCES_ROOT}/${e.name}`);
    },
    async isFile(relative) {
      return (await stat(absolute(relative)).catch(() => null))?.isFile() ?? false;
    },
    readText: (relative) => readFile(absolute(relative), 'utf8'),
    readBytes: (relative) => readFile(absolute(relative)),
  };
}

const UTF8 = new TextDecoder();

/** Captured release files (posix paths → bytes) as a code tree. */
export function filesTree(files: ReadonlyMap<string, Uint8Array>): CodeTree {
  return {
    async componentFolders() {
      const names = new Set<string>();
      for (const file of files.keys()) {
        const match = /^components\/([^/]+)\//.exec(file);
        if (match) names.add(match[1]);
      }
      return [...names];
    },
    async templateFiles() {
      return [...files.keys()].filter((file) => file.startsWith(`${TEMPLATES_ROOT}/`));
    },
    async referenceFiles() {
      return [...files.keys()].filter((file) => file.startsWith(`${REFERENCES_ROOT}/`) && file.split('/').length === 2);
    },
    async isFile(relative) {
      return files.has(relative);
    },
    async readText(relative) {
      const bytes = files.get(relative);
      if (bytes === undefined) throw Object.assign(new Error(`${relative} not found`), { code: 'ENOENT' });
      return UTF8.decode(bytes);
    },
    async readBytes(relative) {
      const bytes = files.get(relative);
      if (bytes === undefined) throw Object.assign(new Error(`${relative} not found`), { code: 'ENOENT' });
      return bytes;
    },
  };
}

/** Reads the block folders of a code root. */
export async function readSiteCode(codeRoot: string): Promise<SiteCode> {
  return siteCodeOf(directoryTree(codeRoot), HTML_CONTRACT);
}

/** Reads the block folders of a code tree, for a release of `htmlContract`. */
export async function siteCodeOf(tree: CodeTree, htmlContract: number): Promise<SiteCode> {
  const allFolders = (await tree.componentFolders()).sort();
  const folders = allFolders.filter((name) => NAME.test(name));
  const issues: SiteCodeIssue[] = [];
  // Problems of the keys for authoring tools that need other files (presets, groups): reported, but they
  // leave the definitions (and the pack) as they are.
  const crossFileIssues: SiteCodeIssue[] = [];
  const folderIssues = allFolders.filter((name) => !NAME.test(name)).map(folderNameIssue);
  const definitions: Record<string, unknown> = {};
  const generated: SiteDescriptor = { htmlContract, components: {} };
  for (const name of folders) {
    const base = `components/${name}/${name}`;
    if (name === SECTION_METADATA_BLOCK) {
      issues.push(reservedBlockIssue(`components/${name}`));
      continue;
    }
    const [css, js, json] = await Promise.all([
      tree.isFile(`${base}.css`),
      tree.isFile(`${base}.js`),
      tree.isFile(`${base}.json`),
    ]);
    // A definition-only block (no CSS, no JS) is declared too, so the loader accepts its roots.
    if (css || js || json) generated.components[name] = { css, js };
    if (!json) continue;
    const file = `${base}.json`;
    try {
      definitions[name] = withoutSchemaRef(JSON.parse(await tree.readText(file)));
    } catch (error) {
      issues.push({
        code: 'BLOCKS_PACK_INVALID',
        pointer: '',
        message: `Not valid JSON: ${(error as Error).message}.`,
        fix: 'Fix the JSON syntax.',
        file,
      });
    }
  }
  let pack: BlockPack | null = null;
  if (Object.keys(definitions).length > 0 && issues.length === 0) {
    const parsed = parsePack(JSON.stringify({ schema: PACK_SCHEMA, blocks: definitions }));
    pack = parsed.pack;
    for (const issue of parsed.issues) {
      const match = /^\/blocks\/([^/]+)(.*)$/.exec(issue.pointer);
      issues.push({
        ...issue,
        pointer: match ? match[2] : issue.pointer,
        file: match ? `components/${match[1]}/${match[1]}.json` : 'components',
      });
    }
  }
  crossFileIssues.push(...(await authoringIssues(tree, pack)));
  // The blocks' labels reach their JavaScript through the generated descriptor (BlockMeta.ui).
  for (const block of pack?.blocks.values() ?? []) {
    const entry = generated.components[block.name];
    if (entry && Object.keys(block.extras.ui).length > 0) entry.ui = block.extras.ui;
  }
  let descriptor: SiteDescriptor | null = Object.keys(generated.components).length > 0 ? generated : null;
  let isGenerated = true;
  if (await tree.isFile(DESCRIPTOR_PATH)) {
    isGenerated = false;
    try {
      descriptor = JSON.parse(await tree.readText(DESCRIPTOR_PATH)) as SiteDescriptor;
    } catch {
      descriptor = null; // the descriptor checks report it
    }
    const declared = descriptor !== null && typeof descriptor === 'object' ? descriptor.components : null;
    if (declared !== null && typeof declared === 'object' && Object.hasOwn(declared, SECTION_METADATA_BLOCK))
      issues.push(reservedBlockIssue(DESCRIPTOR_PATH));
  }
  // With invalid block definitions the pack is unknown, so names in `blocks` cannot be checked.
  const blockNames = issues.length === 0 ? new Set(pack?.blocks.keys()) : null;
  const templates = await readTemplates(tree, blockNames, issues);
  const settings = await readSiteSettings(tree, issues);
  const authoringDefault = settings.authoring;
  descriptor = withSiteBlocks(descriptor, isGenerated, settings.blocks, htmlContract, issues);
  const references = await readReferenceTables(tree);
  issues.push(...references.issues, ...crossFileIssues, ...folderIssues);
  return {
    pack,
    definitions: pack ? definitions : null,
    diagnostics: await diagnosticsOf(tree, issues),
    descriptor,
    generated: isGenerated,
    templates,
    authoringDefault,
    references: references.tables,
  };
}

// Keys for authoring tools that name other files: a block's `presets` are ids of its examples, its `group` one of
// the groups of components/editor.json (when the site has one, which is checked too). Whether a preset's content
// is usable is known only once the examples are rendered (blocks/render.ts presetDiagnostics).
async function authoringIssues(tree: CodeTree, pack: BlockPack | null): Promise<SiteCodeIssue[]> {
  const issues: SiteCodeIssue[] = [];
  let groups: ReadonlySet<string> | null = null;
  if (await tree.isFile(EDITOR_CONFIG_FILE)) {
    const { config, problems } = parseEditorConfig(await tree.readText(EDITOR_CONFIG_FILE));
    for (const problem of problems) {
      issues.push({
        code: 'EDITOR_CONFIG_INVALID',
        pointer: problem.pointer,
        message: problem.message,
        fix: null,
        file: EDITOR_CONFIG_FILE,
      });
    }
    if (config) groups = new Set(config.groups.map((group) => group.id));
  }
  for (const block of pack?.blocks.values() ?? []) {
    const file = `components/${block.name}/${block.name}.json`;
    const { presets, group } = block.authoring;
    if (group !== undefined && groups !== null && !groups.has(group)) {
      issues.push({
        code: 'EDITOR_CONFIG_INVALID',
        pointer: '/group',
        message: `The group "${group}" is not in the groups of ${EDITOR_CONFIG_FILE}.`,
        fix: `Add {"id": "${group}"} to "groups" there, or name one of its groups.`,
        file,
      });
    }
    if (!presets || presets.length === 0) continue;
    const examples = exampleFileOf(block.name);
    const ids = await exampleIds(tree, examples);
    presets.forEach((id, index) => {
      if (ids.includes(id)) return;
      issues.push({
        code: 'BLOCK_PRESET_UNKNOWN',
        pointer: `/presets/${index}`,
        message: `"${id}" is not an example of ${examples}.`,
        fix: `Give an example the marker \`<!-- example: Title {#${id}} -->\`, or remove the preset.`,
        file,
      });
    });
  }
  return issues;
}

/** The ids of the examples of an example file whose marker and content are well formed; none without the file. */
async function exampleIds(tree: CodeTree, file: string): Promise<string[]> {
  if (!(await tree.isFile(file))) return [];
  const parsed = parseExampleFile(await tree.readText(file));
  const usable = parsed.examples.filter((example) => example.problems.length === 0);
  return usable.map((example) => example.id);
}

// `$schema` (a string) names the JSON Schema for editors (blocks/schema.ts); the engine
// ignores it, so it never reaches blocks.json or a signature. Any other value stays an unknown key.
function withoutSchemaRef(definition: unknown): unknown {
  if (
    definition === null ||
    typeof definition !== 'object' ||
    Array.isArray(definition) ||
    typeof (definition as Record<string, unknown>).$schema !== 'string'
  )
    return definition;
  const { $schema: _ignored, ...rest } = definition as Record<string, unknown>;
  return rest;
}

const NO_SETTINGS: SiteConfig = Object.freeze({ authoring: null, blocks: null });

async function readSiteSettings(tree: CodeTree, issues: SiteCodeIssue[]): Promise<SiteConfig> {
  if (!(await tree.isFile(SITE_FILE))) return NO_SETTINGS;
  const { config, problems } = parseSiteConfig(await tree.readBytes(SITE_FILE));
  if (config) return config;
  for (const { line, column, field, message } of problems) {
    issues.push({
      code: 'SITE_CONFIG_INVALID',
      pointer: field ?? '',
      message,
      fix: null,
      file: SITE_FILE,
      line,
      column,
    });
  }
  return NO_SETTINGS;
}

// site.yaml `blocks` goes into the descriptor the engine generates (a site without block folders gets one with no
// components). A hand-written components/components.json names its own `blocks`: one place, not two.
function withSiteBlocks(
  descriptor: SiteDescriptor | null,
  isGenerated: boolean,
  blocks: BlocksEntry | null,
  htmlContract: number,
  issues: SiteCodeIssue[],
): SiteDescriptor | null {
  if (blocks === null) return descriptor;
  if (!isGenerated) {
    const message = 'site.yaml names `blocks`, but the site has a hand-written components/components.json.';
    const fix = 'Move `blocks` into components/components.json, or delete that file to let the engine generate it.';
    issues.push({ code: 'SITE_CONFIG_INVALID', pointer: 'blocks', message, fix, file: SITE_FILE });
    return descriptor;
  }
  return { ...(descriptor ?? { htmlContract, components: {} }), blocks };
}


function folderNameIssue(name: string): SiteCodeIssue {
  return {
    code: 'CODE_FOLDER_NAME_INVALID',
    pointer: '',
    message: `"${name}" is not a block name, so this folder is never read as a block.`,
    fix: 'Rename the folder: lowercase letters, digits and "-", starting with a letter (at most 32).',
    file: `components/${name}`,
  };
}

function reservedBlockIssue(file: string): SiteCodeIssue {
  return {
    code: 'BLOCKS_PACK_INVALID',
    pointer: '',
    message: `"${SECTION_METADATA_BLOCK}" is reserved by the engine; a site cannot define it.`,
    fix: 'Choose another block name.',
    file,
  };
}

function templateIssue(file: string, message: string, fix: string | null = null): SiteCodeIssue {
  return { code: 'TEMPLATE_DEFINITION_INVALID', pointer: '', message, fix, file };
}

async function readTemplateDefinition(tree: CodeTree, file: string): Promise<{ value?: unknown; problem?: string }> {
  try {
    return { value: JSON.parse(await tree.readText(file)) };
  } catch (error) {
    return { problem: `Not valid JSON: ${(error as Error).message}.` };
  }
}

/** One template folder as a registry record; null (with its issues reported) when it is invalid. */
async function readTemplate(
  tree: CodeTree,
  name: string,
  files: readonly string[],
  blockNames: ReadonlySet<string> | null,
  issues: SiteCodeIssue[],
): Promise<TemplateRecord | null> {
  const folder = `${TEMPLATES_ROOT}/${name}`;
  if (!TEMPLATE_NAME_PATTERN.test(name)) {
    issues.push(
      templateIssue(
        folder,
        `Invalid template name "${name}".`,
        'Use lowercase letters, digits and hyphens, starting with a letter.',
      ),
    );
    return null;
  }
  const base = `${folder}/${name}`;
  const file = `${base}.json`;
  if (!files.includes(file)) {
    issues.push(templateIssue(file, `Template folder "${name}" has no definition.`, `Create ${file}.`));
    return null;
  }
  const { value, problem } = await readTemplateDefinition(tree, file);
  if (problem !== undefined) {
    issues.push(templateIssue(file, problem, 'Fix the JSON syntax.'));
    return null;
  }
  const { definition, problems } = parseTemplateDefinition(value);
  const missingBlocks = (definition?.blocks ?? []).filter((block) => blockNames !== null && !blockNames.has(block));
  for (const message of problems) issues.push(templateIssue(file, message));
  for (const block of missingBlocks) {
    issues.push(
      templateIssue(
        file,
        `"blocks": block "${block}" is not in the site blocks.`,
        `Define it in components/${block}/${block}.json, or remove it from "blocks".`,
      ),
    );
  }
  if (definition === null || missingBlocks.length > 0) return null;
  return { ...definition, css: files.includes(`${base}.css`), js: files.includes(`${base}.js`) };
}

async function readTemplates(
  tree: CodeTree,
  blockNames: ReadonlySet<string> | null,
  issues: SiteCodeIssue[],
): Promise<TemplateRegistry | null> {
  const files = await tree.templateFiles();
  const folders = new Set<string>();
  for (const file of files) {
    const segments = file.split('/');
    if (segments.length > 2) folders.add(segments[1]);
    else
      issues.push(
        templateIssue(file, 'This file is not inside a template folder.', `Move it to ${TEMPLATES_ROOT}/<name>/.`),
      );
  }
  const templates: Record<string, TemplateRecord> = {};
  for (const name of [...folders].sort()) {
    const record = await readTemplate(tree, name, files, blockNames, issues);
    if (record !== null) templates[name] = record;
  }
  return Object.keys(templates).length > 0 ? { schema: TEMPLATES_SCHEMA, templates } : null;
}

/** The block a file belongs to: `<name>` of `components/<name>/…`. */
export function componentOf(file: string): string | null {
  const match = /^components\/([^/]+)\//.exec(file);
  return match ? match[1] : null;
}

// The issues as diagnostics: a pointer becomes the field and, in a JSON file, the line and column it names.
async function diagnosticsOf(tree: CodeTree, issues: readonly SiteCodeIssue[]): Promise<Diagnostic[]> {
  const texts = new Map<string, string | null>();
  const textOf = async (file: string): Promise<string | null> => {
    if (!texts.has(file)) texts.set(file, (await tree.isFile(file)) ? await tree.readText(file) : null);
    return texts.get(file) ?? null;
  };
  const diagnostics: Diagnostic[] = [];
  for (const issue of issues) diagnostics.push(await issueDiagnostic(issue, textOf));
  return diagnostics;
}

async function issueDiagnostic(
  issue: SiteCodeIssue,
  textOf: (file: string) => Promise<string | null>,
): Promise<Diagnostic> {
  const { code, pointer, message, fix, file } = issue;
  const position = await issuePosition(issue, textOf);
  return makeDiagnostic({
    code,
    file,
    ...position,
    component: componentOf(file),
    field: pointer || null,
    message,
    fix,
  });
}

async function issuePosition(
  issue: SiteCodeIssue,
  textOf: (file: string) => Promise<string | null>,
): Promise<{ line: number; column: number }> {
  if (issue.line !== undefined && issue.column !== undefined) return { line: issue.line, column: issue.column };
  if (!issue.file.endsWith('.json') || issue.pointer === '') return { line: 1, column: 1 };
  const text = await textOf(issue.file);
  return text === null ? { line: 1, column: 1 } : jsonPointerPosition(text, issue.pointer);
}
