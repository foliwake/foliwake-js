#!/usr/bin/env node
// The command reference of @foliwake/cli, generated from its oclif commands: `pnpm cli:reference` writes it
// between the `<!-- commands -->` and `<!-- commandsstop -->` markers of packages/cli/README.md, which the
// documentation site copies (docs/scripts/reference.mjs). test/cli-reference.test.js fails when it is stale.
// Needs the built package (dist/commands). Deterministic: commands sorted by id, flags by name, no versions.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const README = path.join(ROOT, 'packages/cli/README.md');
const START = '<!-- commands -->';
const STOP = '<!-- commandsstop -->';

async function loadConfig() {
  const oclif = path.join(ROOT, 'packages/cli/node_modules/@oclif/core/lib/index.js');
  const { Config } = await import(pathToFileURL(oclif).href);
  return Config.load(path.join(ROOT, 'packages/cli'));
}

const firstLine = (text) => (text ?? '').split('\n')[0].trim();

/**
 * `text` with `<` and `>` escaped outside `code` spans. A bare `<page path>` in a description would be an
 * unknown HTML tag on npm and breaks the documentation build (VitePress compiles the page as a Vue template).
 */
export function escapeAngles(text) {
  return text
    .split(/(`[^`]*`)/)
    .map((part) => (part.startsWith('`') ? part : part.replaceAll('<', '&lt;').replaceAll('>', '&gt;')))
    .join('');
}

/** Words of `text` in lines of at most 120 columns; lines after the first start with `indent`. */
function wrap(text, indent = '') {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > 120 && line) {
      lines.push(line);
      line = `${indent}${word}`;
    } else line = next;
  }
  return [...lines, line];
}

function flagLine([name, flag]) {
  const value = flag.type === 'option' ? ` <${flag.helpValue ?? 'value'}>` : '';
  const negation = flag.allowNo ? ` / --no-${name}` : '';
  return wrap(`- \`--${name}${value}\`${negation}: ${escapeAngles(firstLine(flag.description))}`, '  ');
}

const GLOBAL = new Set(['json', 'debug', 'server', 'help']);

function commandSection(command) {
  const words = command.id.replaceAll(':', ' ');
  const args = Object.keys(command.args ?? {})
    .map((name) => ` [${name}]`)
    .join('');
  const flags = Object.entries(command.flags ?? {})
    .filter(([name, flag]) => !flag.hidden && !GLOBAL.has(name))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(flagLine);
  const summary = escapeAngles(firstLine(command.summary ?? command.description));
  const heading = `### \`foliwake ${words}${args}\``;
  return [heading, '', ...wrap(summary), ...(flags.length ? ['', ...flags] : []), ''];
}

/** The generated section: every command with its summary and its own flags. */
export async function renderCommands() {
  const config = await loadConfig();
  const commands = [...config.commands].filter((c) => !c.hidden).sort((a, b) => (a.id < b.id ? -1 : 1));
  const intro = [
    'Every command also takes `--help`; those that call a server take `--server <origin or host>`, `--json`',
    'and `--debug`.',
    '',
  ];
  return [...intro, ...commands.flatMap(commandSection)].join('\n');
}

/** The README with its section replaced: [current, expected]. */
export async function renderReadme() {
  const current = readFileSync(README, 'utf8');
  const start = current.indexOf(START);
  const stop = current.indexOf(STOP);
  if (start < 0 || stop < start) throw new Error(`packages/cli/README.md needs ${START} … ${STOP}`);
  const expected = `${current.slice(0, start + START.length)}\n\n${await renderCommands()}\n${current.slice(stop)}`;
  return [current, expected];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, expected] = await renderReadme();
  writeFileSync(README, expected);
  console.log('cli-reference: packages/cli/README.md');
}
