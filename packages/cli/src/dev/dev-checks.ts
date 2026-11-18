// The problems `foliwake dev --remote --watch` reports after a change (terminal and browser overlay): the
// component descriptor (the rules of @foliwake/site-check) and a syntax check of the JavaScript modules under
// components/ and scripts/. Content is remote, so there are no content errors here. Messages carry
// project-relative paths only.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { checkDescriptor } from '@foliwake/site-check/descriptor-check';
import { HTML_CONTRACT } from '@foliwake/site-check/formats/constants';
import type { Diagnostic } from '@foliwake/site-check/formats/diagnostics';

import type { DevProblem } from './dev-reload.js';

const SYNTAX_TIMEOUT_MS = 10000;
const SYNTAX_PARALLEL = 4;

/** A diagnostic file as the terminal prints it (code-root relative); never an absolute path. */
export function projectRelative(file: string): string {
  return path.isAbsolute(file) ? path.basename(file) : file.split(path.sep).join('/');
}

export function toProblem(d: Diagnostic): DevProblem {
  const scope = [d.component, d.field].filter((v) => v != null).join(' ');
  return {
    file: projectRelative(d.file),
    line: d.line,
    column: d.column,
    code: d.code,
    message: scope ? `${scope}: ${d.message}` : d.message,
    fix: d.fix,
  };
}

// Parses one module with `node --check` (stdin, module goal): nothing is executed.
function checkModuleSource(
  source: string,
): Promise<{ line: number | null; column: number | null; message: string } | null> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, ['--input-type=module', '--check', '-'], {
      stdio: ['pipe', 'ignore', 'pipe'],
      env,
    });
    let stderr = '';
    const timer = setTimeout(() => child.kill(), SYNTAX_TIMEOUT_MS);
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      if (stderr.length < 20000) stderr += chunk;
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null); // cannot check here: the browser still reports load errors
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(null);
      const lines = stderr.split('\n');
      const at = /^\[stdin\]:(\d+)/.exec(lines[0] ?? '');
      const caretLine = lines.findIndex((l, i) => i > 1 && /^\s*\^+\s*$/.test(l));
      const column = caretLine >= 0 ? lines[caretLine].indexOf('^') + 1 : null;
      const message = lines.find((l) => /^[A-Za-z]*Error\b/.test(l)) ?? 'The module cannot be parsed.';
      resolve({ line: at ? Number(at[1]) : null, column, message: message.trim() });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(source);
  });
}

async function listModules(cwd: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (absolute: string, relative: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(path.join(absolute, entry.name), child);
      else if (entry.isFile() && entry.name.endsWith('.js')) found.push(child);
    }
  };
  for (const dir of ['components', 'scripts']) await walk(path.join(cwd, dir), dir);
  return found.sort();
}

export interface DevChecker {
  check(): Promise<DevProblem[]>;
}

/** The descriptor problems of the working folder, by the platform's rules. */
export function descriptorDiagnostics(cwd: string): Promise<Diagnostic[]> {
  return checkDescriptor({ cwd, htmlContract: HTML_CONTRACT });
}

/** Problems of the working files; module checks are cached by content digest. */
export function createDevChecker({ cwd }: { cwd: string }): DevChecker {
  const syntaxCache = new Map<string, { digest: string; problem: DevProblem | null }>();

  async function moduleProblems(): Promise<DevProblem[]> {
    const files = await listModules(cwd);
    for (const cached of [...syntaxCache.keys()]) if (!files.includes(cached)) syntaxCache.delete(cached);
    const queue = [...files];
    const worker = async (): Promise<void> => {
      for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        let source: string;
        try {
          source = await readFile(path.join(cwd, ...file.split('/')), 'utf8');
        } catch {
          syntaxCache.delete(file);
          continue;
        }
        const digest = createHash('sha256').update(source).digest('hex');
        if (syntaxCache.get(file)?.digest === digest) continue;
        const failure = await checkModuleSource(source);
        syntaxCache.set(file, {
          digest,
          problem: failure && {
            file,
            line: failure.line,
            column: failure.column,
            code: 'DEV_MODULE_SYNTAX',
            message: failure.message,
            fix: 'Correct the JavaScript syntax at this position and save.',
          },
        });
      }
    };
    await Promise.all(Array.from({ length: SYNTAX_PARALLEL }, worker));
    return files.flatMap((file) => {
      const problem = syntaxCache.get(file)?.problem;
      return problem ? [problem] : [];
    });
  }

  return {
    async check() {
      const [descriptor, modules] = await Promise.all([descriptorDiagnostics(cwd), moduleProblems()]);
      return [...descriptor.filter((d) => d.severity === 'error').map(toProblem), ...modules];
    },
  };
}
