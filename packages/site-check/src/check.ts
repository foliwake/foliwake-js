// The check of a site's code, as the platform runs it when it prepares a code release: over the captured files
// (checkCodeRelease) or over a working folder read the way a capture would read it (checkSiteCode). Everything
// that needs no rendering, store or Git: layout, required and generated files, query.yaml, access.yaml, the
// block definitions, templates, site.yaml, reference tables, the descriptor, block example structure, script
// and stylesheet references, and the limits. The engine adds what only it can do (rendering the examples).
import { checkCodeReferences } from './code-references.js';
import { CATALOGUE_COMPONENTS, checkDescriptorOf } from './descriptor-check.js';
import { parseExampleFile } from './blocks/examples.js';
import { type AccessConfig, ACCESS_FILE, parseAccessConfig } from './formats/access.js';
import { HTML_CONTRACT } from './formats/constants.js';
import { type Diagnostic, hasErrors, makeDiagnostic, sortDiagnostics } from './formats/diagnostics.js';
import {
  CODE_LIMITS,
  ENGINE_PREFIX,
  ENGINE_RELEASE_FILES,
  REQUIRED_FILES,
  ignoredReason,
  isCapturedInput,
  isExampleFile,
  isGeneratedPath,
  isUnderCodeRoot,
} from './formats/layout.js';
import { type QueryConfig, QUERY_FILE, parseQueryConfig } from './formats/query.js';
import type { FileProblem } from './formats/yaml.js';
import { type IgnoredFile, readFolder } from './read-folder.js';

export type { IgnoredFile };
import { type SiteCode, filesTree, siteCodeOf } from './site-code.js';

export interface CodeCheckOptions {
  /** the HTML contract of the release (default HTML_CONTRACT) */
  htmlContract?: number;
  /** the engine's files under `_foliwake/` that a release holds (default ENGINE_RELEASE_FILES) */
  engineFiles?: readonly string[];
  /** the names a hand-written components.json must declare (default CATALOGUE_COMPONENTS) */
  catalogueComponents?: readonly string[];
}

export interface CodeCheckResult {
  /** every problem, sorted */
  diagnostics: Diagnostic[];
  siteCode: SiteCode;
  query: QueryConfig | null;
  access: AccessConfig | null;
  /** the files a code release would capture, sorted */
  captured: string[];
  /** files under the code roots that are not captured */
  ignored: IgnoredFile[];
}

/** Checks the captured files of a code release (posix paths relative to the site root → bytes). */
export async function checkCodeRelease(
  files: ReadonlyMap<string, Uint8Array>,
  options: CodeCheckOptions = {},
): Promise<CodeCheckResult> {
  return checkInputs(files, [], options);
}

/**
 * Checks a working folder as the platform would check a commit of it: the files a capture would take (committed
 * or not), and a note for each file under the code roots that a capture never takes.
 */
export async function checkSiteCode(root: string, options: CodeCheckOptions = {}): Promise<CodeCheckResult> {
  const { files, ignored } = await readFolder(root);
  return checkInputs(files, ignored, options);
}

async function checkInputs(
  files: ReadonlyMap<string, Uint8Array>,
  folderIgnored: readonly IgnoredFile[],
  options: CodeCheckOptions,
): Promise<CodeCheckResult> {
  const htmlContract = options.htmlContract ?? HTML_CONTRACT;
  const engineFiles = (options.engineFiles ?? ENGINE_RELEASE_FILES).map((name) => `${ENGINE_PREFIX}/${name}`);
  const inputs = sortInputs(files, engineFiles);
  const ignored = [...folderIgnored, ...inputs.ignored].sort((a, b) => compare(a.file, b.file));
  const has = (relative: string) => inputs.captured.has(relative) || engineFiles.includes(relative);

  const diagnostics: Diagnostic[] = [...inputs.generated.map(generatedDiagnostic), ...ignored.map(ignoredDiagnostic)];
  diagnostics.push(...REQUIRED_FILES.filter((file) => !inputs.captured.has(file)).map(requiredDiagnostic));
  const query = readRootConfig(inputs.captured, QUERY_FILE, 'QUERY_CONFIG_INVALID', parseQueryConfig, diagnostics);
  const access = readRootConfig(inputs.captured, ACCESS_FILE, 'ACCESS_CONFIG_INVALID', parseAccessConfig, diagnostics);

  const tree = filesTree(inputs.captured);
  const siteCode = await siteCodeOf(tree, htmlContract);
  diagnostics.push(...siteCode.diagnostics);
  if (!hasErrors(siteCode.diagnostics)) diagnostics.push(...exampleDiagnostics(inputs.captured, siteCode));
  const catalogue = options.catalogueComponents ?? CATALOGUE_COMPONENTS;
  diagnostics.push(...(await checkDescriptorOf(tree, siteCode, { htmlContract, schemaNames: catalogue })));
  diagnostics.push(...checkCodeReferences(inputs.captured, has), ...limitDiagnostics(inputs.captured));

  const captured = [...inputs.captured.keys()].sort(compare);
  return { diagnostics: sortDiagnostics(diagnostics), siteCode, query, access, captured, ignored };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface SortedInputs {
  captured: Map<string, Uint8Array>;
  generated: string[];
  ignored: IgnoredFile[];
}

// Captured inputs; the engine's own files (accepted, not inputs); generated files (refused); the rest ignored.
function sortInputs(files: ReadonlyMap<string, Uint8Array>, engineFiles: readonly string[]): SortedInputs {
  const sorted: SortedInputs = { captured: new Map(), generated: [], ignored: [] };
  for (const [file, bytes] of files) {
    if (engineFiles.includes(file)) continue;
    if (isGeneratedPath(file)) sorted.generated.push(file);
    else if (isCapturedInput(file)) sorted.captured.set(file, bytes);
    else if (isUnderCodeRoot(file)) sorted.ignored.push({ file, reason: ignoredReason(file) });
  }
  return sorted;
}

function generatedDiagnostic(file: string): Diagnostic {
  const engine = file.startsWith(`${ENGINE_PREFIX}/`);
  return makeDiagnostic({
    code: 'CODE_FILE_GENERATED',
    file,
    message: engine
      ? `${ENGINE_PREFIX}/ holds the engine's own files; a site cannot write them.`
      : `${file} is generated by the engine from the site code; it cannot be an input.`,
    fix: 'Delete the file from the repository.',
  });
}

function ignoredDiagnostic({ file, reason }: IgnoredFile): Diagnostic {
  return makeDiagnostic({
    code: 'CODE_PATH_IGNORED',
    file,
    message: `${reason}; the platform never captures this file.`,
    fix: 'Rename or move it if a page needs it; otherwise ignore this note.',
  });
}

function requiredDiagnostic(file: string): Diagnostic {
  return makeDiagnostic({
    code: 'CODE_FILE_REQUIRED',
    file,
    message: `Every code release needs ${file}; it is missing.`,
    fix: `Create ${file} (and commit it).`,
  });
}

// query.yaml and access.yaml: an invalid file refuses the release.
function readRootConfig<T>(
  files: ReadonlyMap<string, Uint8Array>,
  file: string,
  code: string,
  parse: (bytes: Uint8Array) => { config: T; problems?: undefined } | { config?: undefined; problems: FileProblem[] },
  diagnostics: Diagnostic[],
): T | null {
  const bytes = files.get(file);
  if (bytes === undefined) return null;
  const result = parse(bytes);
  for (const problem of result.problems ?? []) diagnostics.push(fileProblemDiagnostic(code, file, problem));
  return result.config ?? null;
}

function fileProblemDiagnostic(code: string, file: string, { line, column, field, message }: FileProblem): Diagnostic {
  return makeDiagnostic({ code, file, line, column, field, message });
}

// Block examples: each file belongs to a block of the site, and its markers and examples are well formed.
// Rendering them is the engine's.
function exampleDiagnostics(files: ReadonlyMap<string, Uint8Array>, site: SiteCode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [file, bytes] of files) {
    if (!isExampleFile(file)) continue;
    const name = file.split('/')[1];
    if (site.pack?.blocks.has(name)) diagnostics.push(...exampleFileDiagnostics(file, name, bytes));
    else diagnostics.push(unknownBlockDiagnostic(file, name));
  }
  return diagnostics;
}

function unknownBlockDiagnostic(file: string, name: string): Diagnostic {
  return makeDiagnostic({
    code: 'EXAMPLE_BLOCK_UNKNOWN',
    file,
    component: name,
    message: `There is no block "${name}" (components/${name}/${name}.json) for this example.`,
    fix: `Define the block in components/${name}/${name}.json, or move the examples to the block they show.`,
  });
}

function exampleFileDiagnostics(file: string, name: string, bytes: Uint8Array): Diagnostic[] {
  const parsed = parseExampleFile(new TextDecoder().decode(bytes));
  const problems = [...parsed.problems, ...parsed.examples.flatMap((example) => example.problems)];
  return problems.map(({ code, line, message }) => makeDiagnostic({ code, file, line, component: name, message }));
}

function limitDiagnostics(files: ReadonlyMap<string, Uint8Array>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  let total = 0;
  for (const [file, bytes] of files) {
    total += bytes.byteLength;
    if (bytes.byteLength > CODE_LIMITS.fileBytes) diagnostics.push(fileTooLarge(file, bytes.byteLength));
  }
  if (total > CODE_LIMITS.releaseBytes || files.size > CODE_LIMITS.files) {
    diagnostics.push(releaseTooLarge(files.size, total));
  }
  return diagnostics;
}

const MIB = 1024 * 1024;

function fileTooLarge(file: string, bytes: number): Diagnostic {
  return makeDiagnostic({
    code: 'CODE_FILE_TOO_LARGE',
    file,
    message: `The file has ${bytes} bytes; a file of site code may have at most ${CODE_LIMITS.fileBytes / MIB} MiB.`,
    fix: 'Make it smaller (compress an image or font, split a script), or serve it from elsewhere.',
  });
}

function releaseTooLarge(count: number, bytes: number): Diagnostic {
  const { files, releaseBytes } = CODE_LIMITS;
  return makeDiagnostic({
    code: 'CODE_RELEASE_TOO_LARGE',
    file: '.',
    message: `The code has ${count} files and ${bytes} bytes; at most ${files} files and ${releaseBytes / MIB} MiB.`,
    fix: 'Remove files that pages do not use, or make large files smaller.',
  });
}
