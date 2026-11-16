// create-foliwake: the new Git repository and its first commit (a code release
// is made only from a clean commit). The author is whatever the user's Git
// configuration says; nothing here sets a name, an e-mail or a remote. Only the
// files this run wrote are staged, so files kept in the folder are never committed.
import { execFile } from 'node:child_process';

// Inherited from a hook or script, these would point git at another repository.
const LOCATION_VARIABLES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_CEILING_DIRECTORIES',
];

export const INITIAL_BRANCH = 'main';

type Git = { ok: true; stdout: string } | { ok: false; reason: string; missing?: boolean };

function git(dir: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<Git> {
  // LC_ALL=C: git's messages in English, so "not a git repository" can be recognised.
  const childEnv: NodeJS.ProcessEnv = { ...env, GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1', LC_ALL: 'C' };
  for (const name of LOCATION_VARIABLES) delete childEnv[name];
  return new Promise((resolve) => {
    execFile('git', args, { cwd: dir, env: childEnv, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      if (!error) return resolve({ ok: true, stdout: String(stdout).trim() });
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return resolve({ ok: false, reason: 'the `git` command was not found', missing: true });
      const detail = String(stderr ?? '')
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
      resolve({ ok: false, reason: detail || error.message });
    });
  });
}

/** Whether `dir` is inside an existing Git work tree. Anything but a clear "no" is `unknown` (fail closed). */
export type Enclosing = { kind: 'none' } | { kind: 'inside'; top: string } | { kind: 'unknown'; reason: string };

export async function enclosingRepository(dir: string, env: NodeJS.ProcessEnv): Promise<Enclosing> {
  const found = await git(dir, ['rev-parse', '--show-toplevel'], env);
  if (found.ok)
    return found.stdout ? { kind: 'inside', top: found.stdout } : { kind: 'unknown', reason: 'inside Git metadata' };
  if (found.missing) return { kind: 'none' }; // no git: the commit step reports it
  if (/not a git repository/i.test(found.reason)) return { kind: 'none' };
  return { kind: 'unknown', reason: found.reason };
}

export type CommitResult = { ok: true; sha: string } | { ok: false; step: 'init' | 'add' | 'commit'; reason: string };

/** `git init` (branch main), stage exactly `files`, commit with the user's identity. */
export async function initAndCommit(
  dir: string,
  files: readonly string[],
  message: string,
  env: NodeJS.ProcessEnv,
): Promise<CommitResult> {
  const init = await git(dir, ['init', '--quiet', `--initial-branch=${INITIAL_BRANCH}`], env);
  if (!init.ok) return { ok: false, step: 'init', reason: init.reason };
  const add = await git(dir, ['add', '--', ...files], env);
  if (!add.ok) return { ok: false, step: 'add', reason: add.reason };
  // useConfigOnly: the user's configured identity, never one git guesses from the host name.
  const commit = await git(dir, ['-c', 'user.useConfigOnly=true', 'commit', '--quiet', '-m', message], env);
  if (!commit.ok) return { ok: false, step: 'commit', reason: commit.reason };
  const sha = await git(dir, ['rev-parse', 'HEAD'], env);
  return sha.ok ? { ok: true, sha: sha.stdout } : { ok: false, step: 'commit', reason: sha.reason };
}
