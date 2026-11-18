#!/usr/bin/env node
// The CLI as someone installs it: packs @foliwake/cli and the workspace packages it depends on, installs the
// tarballs with npm into a throwaway folder (their third-party dependencies from the registry or npm's cache),
// and runs `foliwake login --no-browser` and `foliwake whoami --json` there against a fake server. Until those
// packages are on npm at this version, `npx ./foliwake-cli-<version>.tgz` alone cannot resolve them; this is
// that command with their tarballs beside it. The short-name package `foliwake` is packed too, and
// `npx foliwake --version` and `npx foliwake whoami --json` run through it.
//
//   node tools/cli-tarball-smoke.mjs
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PACKAGES } from './packages.mjs';
import { runCli } from '../test/helpers/cli.js';
import { startFakeCoreServer } from '../test/helpers/fake-core-server.js';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pack(dir, into) {
  const cwd = path.join(ROOT, 'packages', dir);
  execFileSync('pnpm', ['pack', '--pack-destination', into], { cwd, stdio: 'ignore' });
}

/** The folders of `dir` and of every workspace package it depends on, dependencies first. */
function withWorkspaceDependencies(dir, seen = new Set()) {
  if (seen.has(dir)) return [];
  seen.add(dir);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'packages', dir, 'package.json'), 'utf8'));
  const dependencies = Object.entries(manifest.dependencies ?? {});
  const internal = dependencies.filter(([, spec]) => spec === 'workspace:*');
  const folders = internal.map(([name]) => PACKAGES.find((p) => p.name === name).dir);
  return [...folders.flatMap((folder) => withWorkspaceDependencies(folder, seen)), dir];
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * `npx foliwake …` in the install folder: npx runs the `foliwake` bin installed there. Asynchronous: the fake
 * server answers from this process.
 */
async function checkNpx(work, env, origin) {
  const options = { cwd: work, env: { ...process.env, ...env }, timeout: 60_000 };
  const npx = async (args) => (await run('npx', ['--offline', 'foliwake', ...args], options)).stdout;
  const version = await npx(['--version']);
  check(version.startsWith('@foliwake/cli/0.'), `npx foliwake --version: ${version}`);
  const whoami = JSON.parse(await npx(['whoami', '--json']));
  check(whoami.server === origin, `npx foliwake whoami --json: ${JSON.stringify(whoami)}`);
}

const work = mkdtempSync(path.join(os.tmpdir(), 'foliwake-cli-smoke-'));
const fake = await startFakeCoreServer();
try {
  for (const dir of withWorkspaceDependencies('foliwake')) pack(dir, work);
  const tarballs = readdirSync(work).filter((name) => name.endsWith('.tgz'));
  writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));
  const install = ['install', '--no-audit', '--no-fund', '--prefer-offline', ...tarballs.map((t) => `./${t}`)];
  execFileSync('npm', install, { cwd: work, stdio: 'inherit' });
  const bin = path.join(work, 'node_modules', '@foliwake', 'cli', 'dist', 'bin.js');
  const env = { FOLIWAKE_CONFIG_DIR: path.join(work, 'config') };
  const login = await runCli(['login', fake.origin, '--no-browser', '--insecure-storage'], { env, cwd: work, bin });
  check(login.code === 0 && /Your one-time code: ABCD-EFGH/.test(login.stderr), `login: ${login.stderr}`);
  const whoami = await runCli(['whoami', '--json'], { env, cwd: work, bin });
  check(whoami.code === 0 && whoami.json?.server === fake.origin, `whoami: ${whoami.stdout}${whoami.stderr}`);
  await checkNpx(work, env, fake.origin);
  console.log(`cli-tarball-smoke: ${tarballs.join(', ')}: login printed the code, whoami --json answered`);
} finally {
  await fake.close();
  rmSync(work, { recursive: true, force: true });
}
