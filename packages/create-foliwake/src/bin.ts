#!/usr/bin/env node
// The `create-foliwake` command: runCli (cli.ts) on the process's arguments, streams and environment.
import { runCli } from './cli.js';

const io = {
  cwd: process.cwd(),
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
};

runCli(process.argv.slice(2), io).then(
  (status) => {
    process.exitCode = status;
  },
  (error: unknown) => {
    process.stderr.write(`create-foliwake: ${error instanceof Error ? (error.stack ?? error.message) : error}\n`);
    process.exitCode = 1;
  },
);
