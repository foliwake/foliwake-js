// Helpers for the create-foliwake tests (ported from the engine's tests): a temporary working folder with an
// isolated Git configuration (its own identity, no system or user config), runCreate with fake streams, a
// scripted "terminal" that answers prompts when their question appears, and a fake package manager on PATH.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PACKAGE = path.join(REPO, 'packages/create-foliwake');
export const CLI = path.join(PACKAGE, 'dist/bin.js');
export const SITE_CHECK_CLI = path.join(REPO, 'packages/site-check/dist/bin.js');

// The package by its exports; writeProject and runCli are internal modules, imported from its built files.
const DIST = path.join(PACKAGE, 'dist');
export const createFoliwake = await import('create-foliwake');
export const starters = await import('create-foliwake/starters');
export const { writeProject } = await import(path.join(DIST, 'destination.js'));
export const { runCli } = await import(path.join(DIST, 'cli.js'));
export const { runCreate, EXIT_CANCELLED, CreateUsageError, projectFiles, projectProblems } = createFoliwake;

const versionOf = (dir) => JSON.parse(readFileSync(path.join(REPO, 'packages', dir, 'package.json'), 'utf8')).version;
export const CREATE_VERSION = versionOf('create-foliwake');
export const SITE_CHECK_VERSION = versionOf('site-check');

export const IDENTITY = { name: 'Create Test', email: 'create-test@example.invalid' };

function gitConfigText(identity) {
  const lines = ['[commit]', '\tgpgsign = false', '[init]', '\tdefaultBranch = trunk'];
  if (identity) lines.push('[user]', `\tname = ${identity.name}`, `\temail = ${identity.email}`);
  return `${lines.join('\n')}\n`;
}

/** A temporary folder with its own Git configuration; `env` points git at it only. */
export async function workspace({ identity = IDENTITY } = {}) {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'create-foliwake-test-')));
  const gitconfig = path.join(dir, '.gitconfig-test');
  await writeFile(gitconfig, gitConfigText(identity));
  const cwd = path.join(dir, 'work');
  await mkdir(cwd);
  const env = {
    PATH: process.env.PATH,
    HOME: dir,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
    // No identity from the environment: the configuration decides.
    NODE_NO_WARNINGS: '1',
  };
  return { dir, cwd, env, remove: () => rm(dir, { recursive: true, force: true }) };
}

/** Workspaces removed after the file's tests: `const ws = workspaces(after)`, then `await ws()`. */
export function workspaces(after) {
  const cleanups = [];
  after(() => Promise.all(cleanups.map((fn) => fn())));
  return async (options) => {
    const w = await workspace(options);
    cleanups.push(w.remove);
    return w;
  };
}

export const git = (cwd, env, ...args) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The absolute path of the real git (for fake gits that pass most calls through). */
export const realGit = () => execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

/** Streams for a non-interactive run (no TTY) and what was written to them. */
export function plainIO(cwd, env) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = '';
  let err = '';
  stdout.on('data', (chunk) => (out += chunk));
  stderr.on('data', (chunk) => (err += chunk));
  const stdin = new PassThrough();
  stdin.on('data', () => {
    throw new Error('a non-interactive run read standard input');
  });
  return { io: { cwd, env, stdin, stdout, stderr }, out: () => out, err: () => err };
}

const plainText = (text) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

/**
 * Streams of a scripted terminal: `script` is a list of [question pattern, keys];
 * each keys string is typed once its question has appeared in the output.
 * `answered()` counts the questions that were answered.
 */
export function terminalIO(cwd, env, script) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const output = new PassThrough();
  output.isTTY = true;
  output.columns = 100;
  output.rows = 40;
  let screen = '';
  let step = 0;
  let seen = 0;
  output.on('data', (chunk) => {
    screen += chunk;
    while (step < script.length) {
      const [pattern, keys] = script[step];
      if (!pattern.test(plainText(screen.slice(seen)))) break;
      seen = screen.length;
      step += 1;
      setTimeout(() => input.write(keys), 5);
    }
  });
  const stderr = new PassThrough();
  let err = '';
  stderr.on('data', (chunk) => (err += chunk));
  return {
    io: { cwd, env, stdin: input, stdout: output, stderr, prompts: { input, output } },
    screen: () => plainText(screen),
    err: () => err,
    answered: () => step,
  };
}

export const KEY = { enter: '\r', down: '\x1b[B', ctrlC: '\x03' };

/** Every file below `dir` (posix paths, sorted), without Git metadata. */
export async function tree(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const relative = files.map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));
  return relative.map((file) => file.split(path.sep).join('/')).filter((file) => !file.startsWith('.git/')).sort();
}

export const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The text of one planned project file. */
export const fileText = (files, file) => files.find((f) => f.path === file).bytes.toString('utf8');

/**
 * A fake package manager `name` in `bin`: it appends "<real cwd>|<args>" to `log` and exits with `status`.
 * Put `bin` first on PATH; nothing is downloaded.
 */
export async function fakePackageManager(bin, name, { log, status = 0 }) {
  await mkdir(bin, { recursive: true });
  const script = `#!/bin/sh\necho "$(pwd -P)|$*" >> '${log}'\nexit ${status}\n`;
  await writeFile(path.join(bin, name), script);
  await chmod(path.join(bin, name), 0o755);
}

/** The lines a fake package manager recorded (none when it never ran). */
export async function recorded(log) {
  const text = await readFile(log, 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean);
}
