#!/usr/bin/env node
// The CLI as someone installs it: packs @foliwake/core-contract and @foliwake/cli, installs both tarballs with
// npm into a throwaway folder (their third-party dependencies from the registry or npm's cache), and runs
// `foliwake login --no-browser` and `foliwake whoami --json` there against a fake server. Until
// @foliwake/core-contract is on npm, `npx ./foliwake-cli-<version>.tgz` alone cannot resolve it; this is that
// command with the contract's tarball beside it.
//
//   node tools/cli-tarball-smoke.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../test/helpers/cli.js';
import { startFakeCoreServer } from '../test/helpers/fake-core-server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pack(dir, into) {
  execFileSync('pnpm', ['pack', '--pack-destination', into], { cwd: path.join(ROOT, 'packages', dir), stdio: 'ignore' });
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const work = mkdtempSync(path.join(os.tmpdir(), 'foliwake-cli-smoke-'));
const fake = await startFakeCoreServer();
try {
  pack('core-contract', work);
  pack('cli', work);
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
  console.log(`cli-tarball-smoke: ${tarballs.join(', ')}: login printed the code, whoami --json answered`);
} finally {
  await fake.close();
  rmSync(work, { recursive: true, force: true });
}
