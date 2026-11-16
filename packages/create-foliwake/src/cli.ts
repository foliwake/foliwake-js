// The command line of create-foliwake: `npm create foliwake@latest [folder] [flags]` (also npx create-foliwake,
// pnpm create foliwake, yarn create foliwake, bun create foliwake). Exit status: 0 created; 1 a failed step;
// 2 refused input; 130 cancelled.
import { parseArgs } from 'node:util';

import { type CreateIO, runCreate } from './create.js';
import { type CreateRequest, CreateUsageError, TEMPLATES, type TemplateName } from './options.js';
import { packageVersion } from './starters.js';

export const EXIT_USAGE = 2;

export const USAGE = `Usage: create-foliwake [folder] [options]

Creates a Foliwake site frontend: blocks, styles, local sample pages, checks and GitHub workflows.
In a terminal it asks for what the options leave open; otherwise (or with --no-interactive) it uses the
defaults: folder foliwake-site, template minimal, no React, no Storybook, a Git repository with a first commit.

  --template minimal|examples      minimal: one page and one block; examples: two pages and three blocks
  --site <id>                      the site id on your Foliwake server, if you know it
  --react / --no-react             React and ReactDOM vendored in scripts/vendor/ and a React example block
  --storybook / --no-storybook     Storybook for the blocks (\`npm run stories\` needs the Foliwake CLI)
  --install / --no-install         install Storybook's npm packages with the package manager that ran create
  --git / --no-git                 a Git repository (branch main) and the first commit with your Git identity
  --overwrite | --keep-existing    a non-empty folder: remove its files (.git is kept) | add the project next to them
  --interactive / --no-interactive ask for missing values (default: only in a terminal)
  -h, --help, --version`;

const OPTIONS = {
  template: { type: 'string' },
  site: { type: 'string' },
  react: { type: 'boolean' },
  storybook: { type: 'boolean' },
  install: { type: 'boolean' },
  git: { type: 'boolean' },
  overwrite: { type: 'boolean' },
  'keep-existing': { type: 'boolean' },
  interactive: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
} as const;

type Parsed = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true; allowNegative: true }>>;

function parse(args: readonly string[]): Parsed {
  try {
    return parseArgs({ args: [...args], options: OPTIONS, allowPositionals: true, allowNegative: true, strict: true });
  } catch (error) {
    throw new CreateUsageError((error as Error).message);
  }
}

/** The request the command line makes (undefined: not given). */
export function requestOf(args: readonly string[]): CreateRequest | 'help' | 'version' {
  const { values, positionals } = parse(args);
  if (values.help) return 'help';
  if (values.version) return 'version';
  if (positionals.length > 1) throw new CreateUsageError(`one folder only, got ${positionals.join(', ')}`);
  if (values.overwrite && values['keep-existing'])
    throw new CreateUsageError('--overwrite and --keep-existing: choose one.');
  const template = values.template;
  if (template !== undefined && !(TEMPLATES as readonly string[]).includes(template)) {
    throw new CreateUsageError(`Unknown template "${template}": use ${TEMPLATES.join(' or ')}.`);
  }
  return {
    folder: positionals[0],
    template: template as TemplateName | undefined,
    site: values.site,
    react: values.react,
    storybook: values.storybook,
    install: values.install,
    git: values.git,
    existing: values.overwrite ? 'clear' : values['keep-existing'] ? 'keep' : undefined,
    interactive: values.interactive,
  };
}

/** Runs the command; resolves to the exit status. */
export async function runCli(args: readonly string[], io: CreateIO): Promise<number> {
  try {
    const request = requestOf(args);
    if (request === 'help' || request === 'version') {
      io.stdout.write(`${request === 'help' ? USAGE : await packageVersion()}\n`);
      return 0;
    }
    return await runCreate(request, io);
  } catch (error) {
    if (!(error instanceof CreateUsageError)) throw error;
    io.stderr.write(`create-foliwake: ${error.message}\n`);
    return EXIT_USAGE;
  }
}
