// `foliwake-site-check [dir]` (`npx @foliwake/site-check`): checks a site's code folder the way the platform
// checks a commit of it, and prints the diagnostics. For CI and terminals alike: plain text, JSON, or GitHub
// Actions annotations; no prompts and no colours.
//
// Exit status: 0 no errors (warnings and notes allowed); 1 errors (with --strict, warnings too); 2 a usage
// error or `dir` is not a folder.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { type CodeCheckResult, checkSiteCode } from './check.js';
import { HTML_CONTRACT } from './formats/constants.js';
import { type Diagnostic, formatDiagnostic } from './formats/diagnostics.js';
import { CODE_ROOTS, CODE_ROOT_FILES } from './formats/layout.js';

/** The schema of the --json output. */
export const JSON_SCHEMA = 'foliwake-site-check/1';

export const EXIT_OK = 0;
export const EXIT_PROBLEMS = 1;
export const EXIT_USAGE = 2;

type Format = 'text' | 'json' | 'github';

interface CliOptions {
  dir: string;
  format: Format;
  strict: boolean;
  quiet: boolean;
}

/** Where the CLI writes, and the folder it runs in (tests give their own). */
export interface CliIO {
  cwd: string;
  out: (text: string) => void;
  err: (text: string) => void;
}

const USAGE = `Usage: foliwake-site-check [dir] [--json | --format text|json|github] [--strict] [--quiet]

Checks the site code in dir (default: the current folder) the way the Foliwake platform checks a commit of it.
  --json, --format json   one JSON object (schema ${JSON_SCHEMA})
  --format github         GitHub Actions annotations
  --strict                warnings fail too (exit 1)
  --quiet                 only problems and the summary line: no notes, no header
  --version, -h/--help
Exit status: 0 no errors, 1 errors (or warnings with --strict), 2 usage error.`;

const CLOSING =
  'Block examples and pages are rendered only by the engine: ' +
  '`foliwake page check` locally, or the branch preview on the platform.';

class UsageError extends Error {}

/** The package version (read from its package.json). */
export function packageVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return manifest.version;
}

function formatOf(value: string | undefined): Format {
  if (value === 'text' || value === 'json' || value === 'github') return value;
  throw new UsageError(`--format must be text, json or github, not ${JSON.stringify(value ?? '')}`);
}

function parseArgs(args: readonly string[]): CliOptions | 'help' | 'version' {
  const options: CliOptions = { dir: '.', format: 'text', strict: false, quiet: false };
  const folders: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') return 'help';
    if (arg === '--version') return 'version';
    if (arg === '--json') options.format = 'json';
    else if (arg === '--format') options.format = formatOf(args[++i]);
    else if (arg.startsWith('--format=')) options.format = formatOf(arg.slice('--format='.length));
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg.startsWith('-')) throw new UsageError(`unknown option ${arg}`);
    else folders.push(arg);
  }
  if (folders.length > 1) throw new UsageError(`one folder only, got ${folders.join(', ')}`);
  options.dir = folders[0] ?? '.';
  return options;
}

function assertFolder(absolute: string, shown: string): void {
  const stats = statSync(absolute, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) throw new UsageError(`${shown} is not a folder`);
}

interface Counts {
  errors: number;
  warnings: number;
  notes: number;
}

function countsOf(diagnostics: readonly Diagnostic[]): Counts {
  const count = (severity: string) => diagnostics.filter((d) => d.severity === severity).length;
  return { errors: count('error'), warnings: count('warning'), notes: count('info') };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function summaryLine(result: CodeCheckResult, counts: Counts): string {
  const roots = [...CODE_ROOTS.map((root) => `${root}/`), ...CODE_ROOT_FILES].join(', ');
  const files = `${plural(result.captured.length, 'file')} would be captured (${roots})`;
  const found = [plural(counts.errors, 'error'), plural(counts.warnings, 'warning'), plural(counts.notes, 'note')];
  return `${files}: ${found.join(', ')}.`;
}

function printText(result: CodeCheckResult, options: CliOptions, io: CliIO): void {
  const shown = options.quiet ? result.diagnostics.filter((d) => d.severity !== 'info') : result.diagnostics;
  if (!options.quiet)
    io.out(`@foliwake/site-check ${packageVersion()} — site code in ${options.dir} (HTML contract ${HTML_CONTRACT})`);
  for (const diagnostic of shown) io.out(formatDiagnostic(diagnostic));
  io.out(summaryLine(result, countsOf(result.diagnostics)));
  if (!options.quiet) io.out(CLOSING);
}

function printJson(result: CodeCheckResult, root: string, io: CliIO): void {
  const counts = countsOf(result.diagnostics);
  const report = {
    schema: JSON_SCHEMA,
    version: packageVersion(),
    htmlContract: HTML_CONTRACT,
    root,
    captured: result.captured,
    ignored: result.ignored,
    diagnostics: result.diagnostics,
    ...counts,
  };
  io.out(JSON.stringify(report, null, 2));
}

// GitHub Actions workflow commands: properties escape %, CR, LF, ":" and ","; the message %, CR and LF.
const escapeData = (text: string) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (text: string) => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
const COMMANDS: Readonly<Record<string, string>> = { error: 'error', warning: 'warning', info: 'notice' };

function annotation(diagnostic: Diagnostic): string {
  const { file, line, column, code, severity, component, field, message, fix } = diagnostic;
  const where = `file=${escapeProperty(file)},line=${line},col=${column},title=${escapeProperty(code)}`;
  const subject = [component, field].filter(Boolean).join(' ');
  const said = subject ? `${subject}: ${message}` : message;
  const text = fix ? `${said}\nfix: ${fix}` : said;
  return `::${COMMANDS[severity]} ${where}::${escapeData(text)}`;
}

function printGithub(result: CodeCheckResult, options: CliOptions, io: CliIO): void {
  const shown = options.quiet ? result.diagnostics.filter((d) => d.severity !== 'info') : result.diagnostics;
  for (const diagnostic of shown) io.out(annotation(diagnostic));
  io.out(summaryLine(result, countsOf(result.diagnostics)));
}

function exitStatus(diagnostics: readonly Diagnostic[], strict: boolean): number {
  const failing = diagnostics.some((d) => d.severity === 'error' || (strict && d.severity === 'warning'));
  return failing ? EXIT_PROBLEMS : EXIT_OK;
}

/** Runs the CLI; resolves to the exit status. */
export async function runCli(args: readonly string[], io: CliIO): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(args);
    if (parsed === 'help' || parsed === 'version') {
      io.out(parsed === 'help' ? USAGE : packageVersion());
      return EXIT_OK;
    }
    assertFolder(path.resolve(io.cwd, parsed.dir), parsed.dir);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.err(`foliwake-site-check: ${error.message}\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  const root = path.resolve(io.cwd, parsed.dir);
  const result = await checkSiteCode(root);
  if (parsed.format === 'json') printJson(result, root, io);
  else if (parsed.format === 'github') printGithub(result, parsed, io);
  else printText(result, parsed, io);
  return exitStatus(result.diagnostics, parsed.strict);
}
