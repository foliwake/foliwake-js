#!/usr/bin/env node
// The `foliwake` command: main (main.ts) on the process's arguments.
import { main } from './main.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
