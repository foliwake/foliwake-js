// create-foliwake safety (ported from the engine's tests of `foliwake create`): Git metadata is never a
// destination or a casualty, nothing is written through a symbolic link inside the destination, a failed write
// leaves nothing of the run behind (and puts --overwrite's originals back), --overwrite never removes a nested
// repository, and an unclear "inside a repository?" answer means no Git step.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  CreateUsageError,
  git,
  plainIO,
  projectFiles,
  realGit,
  runCreate,
  workspaces,
  writeProject,
} from './helpers/create.js';

const ws = workspaces(after);

/** Every path below `dir` with file contents (links listed, not followed). */
async function snapshot(dir) {
  const out = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name);
    const key = path.relative(dir, full);
    out[key] = entry.isFile() ? await readFile(full, 'utf8') : entry.isSymbolicLink() ? 'link' : 'dir';
  }
  return out;
}

/** A writeBytes hook that writes part of the `failAt`-th file, then fails as a full disk does. */
const enospc = (failAt) => {
  let n = 0;
  return async (handle, bytes) => {
    if (++n === failAt) {
      await handle.writeFile(bytes.subarray(0, 3)); // a partial file, then the disk is full
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    }
    await handle.writeFile(bytes);
  };
};

/** A git on PATH that fails `rev-parse`, or any call with the argument `failOn`; else the real git. */
async function fakeGit(w, name, condition) {
  const bin = path.join(w.dir, name);
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, 'git'), `#!/bin/sh\n${condition}\nexec ${realGit()} "$@"\n`);
  await chmod(path.join(bin, 'git'), 0o755);
  return { ...w.env, PATH: `${bin}:${w.env.PATH}` };
}

const failOnArgument = (failOn) => {
  const refuse = `echo "fatal: ${failOn} refused for the test" >&2; exit 128`;
  return `for a in "$@"; do if [ "$a" = "${failOn}" ]; then ${refuse}; fi; done`;
};

/** The hidden folder --overwrite keeps the replaced files in, when it could not delete them. */
const leftoverIn = async (dir) => (await readdir(dir)).find((name) => name.startsWith('.foliwake-create-old-'));

/** A folder `old/locked` whose file cannot be deleted (unlocked in `finally` by the caller). */
async function lockedOldFiles(site) {
  await mkdir(path.join(site, 'old', 'locked'), { recursive: true });
  await writeFile(path.join(site, 'old', 'locked', 'a.txt'), 'old');
  await chmod(path.join(site, 'old', 'locked'), 0o500);
}

test('Git metadata is never a destination (.git, inside it, any case, through a link, a bare repository)', async () => {
  const w = await ws();
  const repo = path.join(w.cwd, 'repo');
  await mkdir(repo);
  git(repo, w.env, 'init', '-q');
  await writeFile(path.join(repo, 'tracked.txt'), 'x');
  git(repo, w.env, 'add', 'tracked.txt');
  git(repo, w.env, 'commit', '-q', '-m', 'one');
  execFileSync('git', ['init', '-q', '--bare', path.join(w.cwd, 'bare.git')], { env: w.env });
  await symlink(path.join(repo, '.git'), path.join(w.cwd, 'link-to-git'));
  const before = await snapshot(path.join(repo, '.git'));
  const bareBefore = await snapshot(path.join(w.cwd, 'bare.git'));
  const cases = [
    { folder: 'repo/.git', existing: 'clear' },
    { folder: 'repo/.git/hooks', existing: 'clear' },
    { folder: 'repo/.GIT/new', existing: 'clear' },
    { folder: '.git' },
    { folder: 'link-to-git/sub', existing: 'clear' },
    { folder: 'link-to-git', existing: 'clear' },
    { folder: 'bare.git', existing: 'clear' },
    { folder: 'bare.git/refs/new' },
  ];
  for (const request of cases) {
    const run = runCreate({ ...request, git: false }, plainIO(w.cwd, w.env).io);
    await assert.rejects(run, CreateUsageError, JSON.stringify(request));
  }
  assert.deepEqual(await snapshot(path.join(repo, '.git')), before, 'the repository metadata is untouched');
  assert.deepEqual(await snapshot(path.join(w.cwd, 'bare.git')), bareBefore, 'the bare repository is untouched');
  assert.equal(git(repo, w.env, 'log', '--format=%s'), 'one');
});

test('--overwrite refuses a folder holding other repositories (.git folder, .git file, bare)', async () => {
  const w = await ws();
  const nested = [
    ['nested-dir', async (site) => {
      await mkdir(path.join(site, 'vendor', 'lib'), { recursive: true });
      git(path.join(site, 'vendor', 'lib'), w.env, 'init', '-q');
    }],
    ['nested-file', async (site) => {
      await mkdir(path.join(site, 'sub'), { recursive: true });
      await writeFile(path.join(site, 'sub', '.git'), 'gitdir: /somewhere/else\n');
    }],
    ['nested-bare', async (site) => {
      execFileSync('git', ['init', '-q', '--bare', path.join(site, 'deep', 'store')], { env: w.env });
    }],
  ];
  for (const [name, make] of nested) {
    const site = path.join(w.cwd, name);
    await mkdir(site);
    git(site, w.env, 'init', '-q');
    await writeFile(path.join(site, 'notes.txt'), 'mine');
    await make(site);
    const before = await snapshot(site);
    const run = runCreate({ folder: name, existing: 'clear', git: false }, plainIO(w.cwd, w.env).io);
    await assert.rejects(run, /contains Git repositories .*never removes a repository/, name);
    assert.deepEqual(await snapshot(site), before, `${name}: nothing changed`);
  }
});

test('--keep-existing never writes through a symbolic link inside the destination', async () => {
  const w = await ws();
  const outside = path.join(w.cwd, 'outside');
  await mkdir(outside);
  for (const linked of ['content', 'components', 'styles']) {
    const site = path.join(w.cwd, `keep-${linked}`);
    await mkdir(site);
    await writeFile(path.join(site, 'notes.txt'), 'mine');
    await symlink(outside, path.join(site, linked));
    const run = runCreate({ folder: `keep-${linked}`, existing: 'keep', git: false }, plainIO(w.cwd, w.env).io);
    await assert.rejects(run, new RegExp(`has ${linked} where the project needs a real folder`));
    assert.deepEqual(await readdir(outside), [], `${linked}: nothing written outside`);
    assert.deepEqual((await readdir(site)).sort(), [linked, 'notes.txt'].sort());
  }
  // A link into another repository's .git, as a part of a generated path.
  const repo = path.join(w.cwd, 'repo');
  await mkdir(repo);
  git(repo, w.env, 'init', '-q');
  const before = await snapshot(path.join(repo, '.git'));
  const site = path.join(w.cwd, 'keep-git');
  await mkdir(site);
  await writeFile(path.join(site, 'notes.txt'), 'mine');
  await symlink(path.join(repo, '.git'), path.join(site, 'scripts'));
  const run = runCreate({ folder: 'keep-git', existing: 'keep', git: false }, plainIO(w.cwd, w.env).io);
  await assert.rejects(run, /real folder/);
  assert.deepEqual(await snapshot(path.join(repo, '.git')), before);

  // The write itself refuses a link too (a link that appears after the checks).
  const raced = path.join(w.cwd, 'raced');
  await mkdir(raced);
  await symlink(outside, path.join(raced, 'content'));
  const files = await projectFiles({ template: 'minimal', target: raced, siteId: null });
  const refused = /symbolic link or a file; nothing is written through it\. Nothing was written\./;
  await assert.rejects(writeProject(raced, files, 'keep'), refused);
  assert.deepEqual(await readdir(outside), []);
  assert.deepEqual(await readdir(raced), ['content'], 'everything this run wrote was removed again');
});

test('a failed write (even mid-file) leaves nothing: files, folders and a new target are removed', async () => {
  const w = await ws();
  const target = path.join(w.cwd, 'new', 'deeper', 'site');
  const files = await projectFiles({ template: 'examples', target, siteId: null });
  for (const failAt of [1, 7, files.length]) {
    await assert.rejects(writeProject(target, files, null, { writeBytes: enospc(failAt) }), /ENOSPC.*nothing was kept/);
    assert.ok(!existsSync(path.join(w.cwd, 'new')), `failAt ${failAt}: the folders this run created are gone`);
  }
  const empty = path.join(w.cwd, 'empty');
  await mkdir(path.join(empty, '.git'), { recursive: true });
  await writeFile(path.join(empty, '.git', 'marker'), 'mine');
  await assert.rejects(writeProject(empty, files, null, { writeBytes: enospc(5) }), /ENOSPC/);
  const untouched = { '.git': 'dir', '.git/marker': 'mine' };
  assert.deepEqual(await snapshot(empty), untouched, 'an existing folder is left as it was');
});

test('--overwrite deletes the originals only after every file is written, and puts them back on failure', async () => {
  const w = await ws();
  const site = path.join(w.cwd, 'site');
  await mkdir(path.join(site, 'old', 'deep'), { recursive: true });
  await mkdir(path.join(site, '.git'));
  await writeFile(path.join(site, '.git', 'marker'), 'mine');
  await writeFile(path.join(site, 'old', 'deep', 'a.txt'), 'old a');
  await writeFile(path.join(site, 'README.md'), 'old readme');
  await writeFile(path.join(site, 'content'), 'a file where the project wants a folder');
  const before = await snapshot(site);
  const files = await projectFiles({ template: 'minimal', target: site, siteId: null });
  for (const failAt of [1, 4, files.length]) {
    const write = writeProject(site, files, 'clear', { writeBytes: enospc(failAt) });
    await assert.rejects(write, /The existing files were put back\./);
    const restored = `failAt ${failAt}: originals restored byte for byte, no backup left`;
    assert.deepEqual(await snapshot(site), before, restored);
  }
  // Through the command: success removes the originals and the hidden backup, keeps .git.
  const run = plainIO(w.cwd, w.env);
  assert.equal(await runCreate({ folder: 'site', existing: 'clear', git: false }, run.io), 0, run.err());
  const after = await snapshot(site);
  assert.equal(after['.git/marker'], 'mine');
  assert.ok(!('old' in after) && after['README.md'] !== 'old readme');
  assert.ok(!Object.keys(after).some((key) => key.startsWith('.foliwake-create-old-')), 'no backup left');
});

test('repository discovery fails closed: an unclear answer means no repository and no commit (exit 1)', async () => {
  const w = await ws();
  // rev-parse fails with something other than "not a git repository"; everything else is real git.
  const refuse = 'echo "fatal: detected dubious ownership in repository" >&2; exit 128';
  const dubious = `if [ "$1" = "rev-parse" ]; then ${refuse}; fi`;
  const env = await fakeGit(w, 'fake-bin', dubious);
  const run = plainIO(w.cwd, env);
  assert.equal(await runCreate({ folder: 'site' }, run.io), 1);
  assert.ok(existsSync(path.join(w.cwd, 'site', 'content', 'index.md')), 'the project is written');
  assert.ok(!existsSync(path.join(w.cwd, 'site', '.git')), 'no repository was created');
  const skipped =
    /Git: skipped: could not tell whether site is inside another repository \(fatal: detected dubious ownership/;
  assert.match(run.out(), skipped);
});

test('replaced files that cannot be deleted: "cleanup incomplete", the first commit, exit 1', async () => {
  const w = await ws();
  const site = path.join(w.cwd, 'site');
  await lockedOldFiles(site);
  const run = plainIO(w.cwd, w.env);
  try {
    assert.equal(await runCreate({ folder: 'site', existing: 'clear' }, run.io), 1, run.err());
    const leftover = await leftoverIn(site);
    assert.ok(leftover, 'the replaced files are kept in one named folder');
    const incomplete =
      'Cleanup incomplete: the project was created, but some of the replaced files could not be deleted ' +
      `\\(E[A-Z]+\\); they are in .*${leftover}\\.`;
    assert.match(run.out(), new RegExp(incomplete));
    assert.match(run.out(), /Git: new repository \(branch main\), first commit [0-9a-f]{7}\./, 'Git setup still ran');
    assert.ok(existsSync(path.join(site, 'content', 'index.md')));
    assert.equal(git(site, w.env, 'ls-files', '--', leftover), '', 'the leftover folder is not committed');
    await chmod(path.join(site, leftover, 'old', 'locked'), 0o700);
  } finally {
    await chmod(path.join(site, 'old', 'locked'), 0o700).catch(() => {});
  }
  // The hook form: the result names the folder and the reason.
  const other = path.join(w.cwd, 'other');
  await mkdir(other);
  await writeFile(path.join(other, 'x.txt'), 'x');
  const files = await projectFiles({ template: 'minimal', target: other, siteId: null });
  const busy = async () => {
    throw Object.assign(new Error('busy'), { code: 'EBUSY' });
  };
  const result = await writeProject(other, files, 'clear', { removeBackup: busy });
  assert.equal(result.leftover.reason, 'EBUSY');
  assert.ok(existsSync(path.join(result.leftover.folder, 'x.txt')));
});

test('recovery instructions fit the failure and never stage other files of the folder with `git add -A`', async () => {
  const w = await ws();
  // `git init` fails in a folder with kept files: an explicit list of the project's files.
  const kept = path.join(w.cwd, 'kept');
  await mkdir(kept);
  await writeFile(path.join(kept, 'notes.txt'), 'mine');
  const initFails = plainIO(w.cwd, await fakeGit(w, 'bin-init', failOnArgument('init')));
  assert.equal(await runCreate({ folder: 'kept', existing: 'keep' }, initFails.io), 1);
  const first = '\\.github\\/actions\\/foliwake-request\\/action\\.yml';
  const explicit = new RegExp(`run \`git init -b main\`, \`git add -- ${first} .* tests\\/workflows\\.test\\.mjs\` `);
  assert.match(initFails.err(), explicit);
  const rest =
    /\(only the project's files; the other files in the folder stay out\) and `git commit -m "Create the site"`/;
  assert.match(initFails.err(), rest);
  assert.doesNotMatch(initFails.err(), /git add -A/);
  assert.doesNotMatch(initFails.err(), /notes\.txt/);
  // The same in a fresh folder: nothing else is there, `git add -A` is right.
  const fresh = plainIO(w.cwd, await fakeGit(w, 'bin-init', failOnArgument('init')));
  assert.equal(await runCreate({ folder: 'fresh' }, fresh.io), 1);
  assert.match(fresh.err(), /`git add -A`/);
  // `git commit` fails (no identity) after an overwrite left replaced files behind: the files are staged already.
  const site = path.join(w.cwd, 'site');
  await lockedOldFiles(site);
  const noIdentity = { ...w.env, GIT_CONFIG_GLOBAL: path.join(w.dir, 'empty-gitconfig') };
  await writeFile(noIdentity.GIT_CONFIG_GLOBAL, '[commit]\n\tgpgsign = false\n');
  const run = plainIO(w.cwd, noIdentity);
  try {
    assert.equal(await runCreate({ folder: 'site', existing: 'clear' }, run.io), 1);
    assert.match(run.out(), /Cleanup incomplete/);
    const staged = /The project's files are staged \(nothing else\)\. .*then run `git commit -m "Create the site"`/;
    assert.match(run.err(), staged);
    assert.doesNotMatch(run.err(), /git add/);
    const leftover = await leftoverIn(site);
    const stagedLeftover = git(site, noIdentity, 'diff', '--cached', '--name-only', '--', leftover);
    assert.equal(stagedLeftover, '', 'the leftover folder is not staged');
    await chmod(path.join(site, leftover, 'old', 'locked'), 0o700);
  } finally {
    await chmod(path.join(site, 'old', 'locked'), 0o700).catch(() => {});
  }
});
