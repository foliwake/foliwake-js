// create-foliwake: the questions, asked only in a terminal and only for what
// the command line left open (like create-vite). @clack/prompts draws them;
// Ctrl+C or Escape cancels the whole run before anything is written.
import type { Readable, Writable } from 'node:stream';

import { confirm, intro, isCancel, select, text } from '@clack/prompts';

import {
  CreateCancelled,
  DEFAULT_FOLDER,
  DEFAULT_TEMPLATE,
  type ExistingFiles,
  type TemplateName,
  folderProblem,
} from './options.js';

export interface PromptStreams {
  input: Readable;
  output: Writable;
}

function answered<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) throw new CreateCancelled();
  return value as Exclude<T, symbol>;
}

export function welcome(io: PromptStreams): void {
  intro('Create a Foliwake site', io);
}

export async function askFolder(io: PromptStreams): Promise<string> {
  const value = answered(
    await text({
      ...io,
      message: 'Project folder',
      placeholder: DEFAULT_FOLDER,
      defaultValue: DEFAULT_FOLDER,
      validate: (v) => (v ? (folderProblem(v) ?? undefined) : undefined),
    }),
  );
  return value === '' ? DEFAULT_FOLDER : value;
}

/** The folder has files: cancel, remove them (.git kept) or add next to them. */
export async function askExisting(
  io: PromptStreams,
  shown: string,
  entries: readonly string[],
): Promise<ExistingFiles> {
  const listed = entries.slice(0, 4).join(', ') + (entries.length > 4 ? ', …' : '');
  const choice = answered(
    await select<ExistingFiles | 'cancel'>({
      ...io,
      message: `${shown === '.' ? 'The current folder' : `Folder "${shown}"`} is not empty (${listed}). What now?`,
      initialValue: 'cancel',
      options: [
        { value: 'cancel', label: 'Cancel' },
        { value: 'clear', label: 'Remove the existing files and continue', hint: '.git is kept' },
        {
          value: 'keep',
          label: 'Keep them and add the project next to them',
          hint: 'stops if a file would be replaced',
        },
      ],
    }),
  );
  if (choice === 'cancel') throw new CreateCancelled();
  return choice;
}

export async function askTemplate(io: PromptStreams): Promise<TemplateName> {
  return answered(
    await select<TemplateName>({
      ...io,
      message: 'Template',
      initialValue: DEFAULT_TEMPLATE,
      options: [
        { value: 'minimal', label: 'minimal', hint: 'one page, one block' },
        { value: 'examples', label: 'examples', hint: 'two pages, three blocks, one with JavaScript' },
      ],
    }),
  );
}

export async function askReact(io: PromptStreams): Promise<boolean> {
  const message = 'Add React support? (React vendored in scripts/vendor/, no npm install, and a React example block)';
  return answered(await confirm({ ...io, message, initialValue: false }));
}

export async function askStorybook(io: PromptStreams): Promise<boolean> {
  const message = 'Add Storybook for your blocks? (needs the Foliwake CLI for `npm run stories`)';
  return answered(await confirm({ ...io, message, initialValue: false }));
}

/** Only after Storybook: its npm packages are the project's only ones, and installing them the only download. */
export async function askInstall(io: PromptStreams, manager: string): Promise<boolean> {
  return answered(
    await confirm({ ...io, message: `Install its npm packages now with ${manager}?`, initialValue: false }),
  );
}

export async function askGit(io: PromptStreams): Promise<boolean> {
  return answered(
    await confirm({ ...io, message: 'Create a Git repository and the first commit?', initialValue: true }),
  );
}
