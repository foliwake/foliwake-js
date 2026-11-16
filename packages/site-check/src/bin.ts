#!/usr/bin/env node
// The `foliwake-site-check` command: runCli (cli.ts) on the process's arguments and streams.
import { runCli } from './cli.js';

const io = {
  cwd: process.cwd(),
  out: (text: string) => process.stdout.write(`${text}\n`),
  err: (text: string) => process.stderr.write(`${text}\n`),
};

runCli(process.argv.slice(2), io).then(
  (status) => {
    process.exitCode = status;
  },
  (error: unknown) => {
    process.stderr.write(`foliwake-site-check: ${error instanceof Error ? (error.stack ?? error.message) : error}\n`);
    process.exitCode = 2;
  },
);
