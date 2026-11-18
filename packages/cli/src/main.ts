// The `foliwake` command of @foliwake/cli: oclif over the commands in dist/commands. People also write flags
// before the command words (`foliwake --server x whoami`); those are moved behind the words first.
import { Config, flush, handle, run, settings } from '@oclif/core';

import { commandWordsFirst } from './command-words.js';

/** The command line for oclif: as given, or with the command words moved before the flags given first. */
async function forOclif(argv: string[]): Promise<string[]> {
  if (!argv.slice(0, 2).some((arg) => arg.startsWith('-'))) return argv;
  const config = await Config.load(import.meta.url);
  const optionFlags = config.commands.flatMap((command) =>
    Object.entries(command.flags)
      .filter(([, flag]) => flag.type === 'option')
      .map(([name]) => name),
  );
  const valueFlags = new Set(optionFlags);
  const ids = new Set(config.commands.map((command) => command.id));
  return commandWordsFirst(argv, (name) => valueFlags.has(name), ids) ?? argv;
}

/** Runs one command line; resolves to its exit code. */
export async function main(argv: string[]): Promise<number> {
  // The package runs from dist/; oclif must not look for TypeScript sources beside it.
  settings.enableAutoTranspile = false;
  try {
    await run(await forOclif(argv), import.meta.url);
    await flush();
    return Number(process.exitCode ?? 0);
  } catch (error) {
    await handle(error instanceof Error ? error : new Error(String(error)));
    return 1;
  }
}
