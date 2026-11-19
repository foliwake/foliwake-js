// `foliwake next init`: the same wizard as `npx @foliwake/next init`, which lives in @foliwake/next. It runs the
// app's installed @foliwake/next when there is one, else that package at this CLI's exact version through npx.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Command } from '@oclif/core';

import { cliVersion } from '../../version.js';

/** The bin of the app's own @foliwake/next, or null when the app has none. */
export function installedInit(cwd: string): string | null {
  try {
    const manifest = createRequire(path.join(cwd, 'package.json')).resolve('@foliwake/next/package.json');
    const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: Record<string, string> };
    const file = bin?.['foliwake-next'];
    return file ? path.resolve(path.dirname(manifest), file) : null;
  } catch {
    return null;
  }
}

export default class NextInit extends Command {
  static summary = 'Set up Foliwake pages in this Next.js app (runs `npx @foliwake/next init`)';

  static description = `Takes the same flags as \`npx @foliwake/next init\`; \`foliwake next init --help\` lists them.
Writes FOLIWAKE_URL to .env.local, wraps next.config in withFoliwake(), and adds one route file and one page.`;

  static examples = [
    '<%= config.bin %> next init --url https://my-site.example.org',
    '<%= config.bin %> next init --url https://my-site.example.org --preview --dry-run',
  ];

  static strict = false;

  async run(): Promise<void> {
    const args = ['init', ...this.argv];
    const local = installedInit(process.cwd());
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const run = local
      ? spawnSync(process.execPath, [local, ...args], { stdio: 'inherit' })
      : spawnSync(npx, ['-y', `@foliwake/next@${cliVersion()}`, ...args], { stdio: 'inherit' });
    if (run.error) this.error(`Could not run @foliwake/next init: ${run.error.message}`, { exit: 1 });
    this.exit(run.status ?? 1);
  }
}
