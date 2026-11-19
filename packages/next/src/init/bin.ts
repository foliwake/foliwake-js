#!/usr/bin/env node
// The `foliwake-next` command (`npx @foliwake/next init`): runInit on the process's arguments and streams.
import { createInterface } from 'node:readline/promises';
import { runInit } from './run.js';

async function ask(question: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
}

const io = {
  stdout: (text: string) => process.stdout.write(text),
  stderr: (text: string) => process.stderr.write(text),
  env: process.env,
  cwd: process.cwd(),
  ...(process.stdin.isTTY ? { ask } : {}),
};

process.exitCode = await runInit(process.argv.slice(2), io);
