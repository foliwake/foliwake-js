import { readFile, stat } from 'node:fs/promises';

import { Args, Errors, Flags } from '@oclif/core';

import { MAX_CREDENTIAL_BYTES } from '../../lib/rules.js';
import { CoreCommand } from '../../core-command.js';
import { credentialSetLines } from '../../render/credentials.js';

/** One trailing line break of a file or a pipe is not part of a token. */
const withoutFinalNewline = (text: string): string => text.replace(/\r?\n$/, '');

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += (chunk as Buffer).length;
    if (size > MAX_CREDENTIAL_BYTES) throw new Errors.CLIError('The value is larger than 64 KiB.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readValueFile(file: string): Promise<string> {
  if ((await stat(file)).size > MAX_CREDENTIAL_BYTES) throw new Errors.CLIError('The file is larger than 64 KiB.');
  return readFile(file, 'utf8');
}

export default class CredentialSet extends CoreCommand {
  static description =
    "Stores a credential value on the server (the installation's owner): a source names it in `credentials`; " +
    'the next sync uses it without a restart. The value is read from a file or stdin, never from the command line ' +
    '(core credentials.set)';

  static examples = [
    '<%= config.bin %> credential set FOLIWAKE_GOOGLE_SA_KEY --from-file key.json',
    'printf %s "$TOKEN" | <%= config.bin %> credential set FOLIWAKE_GIT_TOKEN_DOCS --from-stdin',
  ];

  static args = {
    name: Args.string({ description: 'the name a source refers to, such as FOLIWAKE_GOOGLE_SA_KEY', required: true }),
  };

  static flags = {
    ...CoreCommand.configFlag,
    'from-file': Flags.string({
      description: 'read the value from this file (a Google service-account JSON key is checked)',
      exclusive: ['from-stdin'],
    }),
    'from-stdin': Flags.boolean({ description: 'read the value from standard input', exclusive: ['from-file'] }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(CredentialSet);
    const value = await this.valueOf(flags);
    const answer = await this.core.credentials.set({ name: args.name, value });
    for (const line of credentialSetLines(answer)) this.log(line);
    return answer;
  }

  private async valueOf(flags: {
    'from-file'?: string | undefined;
    'from-stdin'?: boolean | undefined;
  }): Promise<string> {
    if (flags['from-file'] !== undefined) return withoutFinalNewline(await readValueFile(flags['from-file']));
    if (flags['from-stdin']) return withoutFinalNewline(await readStdin());
    throw new Errors.CLIError(
      'Give the value with --from-file <file> or --from-stdin; it is never a command-line argument.',
      { exit: 2 },
    );
  }
}
