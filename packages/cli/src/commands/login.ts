import { Args, Command, Flags } from '@oclif/core';

import {
  CLOUD,
  CLOUD_NOTE,
  ServerAddressError,
  cloudConfigured,
  nameOrigin,
  readProfiles,
  serverDisplay,
  serverOrigin,
} from '../remote/servers.js';
import { COMMAND } from '../settings.js';

const NO_SERVER =
  `Name the server to sign in to: \`${COMMAND} login <origin or host>\`, e.g. https://foliwake.example.`;

/** Asks for the server's address in a terminal; null when cancelled or empty. */
async function askServer(): Promise<string | null> {
  const { isCancel, text } = await import('@clack/prompts');
  const answer = await text({ message: 'Address of your Foliwake server', placeholder: 'https://foliwake.example' });
  return isCancel(answer) || !answer.trim() ? null : answer.trim();
}

export default class Login extends Command {
  static description = 'Sign this computer in to a Foliwake server through the browser (device code)';

  static examples = [
    '<%= config.bin %> login https://foliwake.example',
    '<%= config.bin %> login http://localhost:8080 --default',
    '<%= config.bin %> login 127.0.0.1:8098 --no-browser',
  ];

  static enableJsonFlag = true;

  static args = {
    server: Args.string({
      description: 'server origin or host (asked in a terminal when left out); Foliwake Cloud is not available yet',
    }),
  };

  static flags = {
    browser: Flags.boolean({
      description: 'open the approval page in the browser (--no-browser only prints its address)',
      default: true,
      allowNo: true,
    }),
    default: Flags.boolean({
      description: 'make this server the default of other commands (the first sign-in always is)',
    }),
    'insecure-storage': Flags.boolean({
      description: 'keep the token in a 0600 file when there is no system keychain',
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(Login);
    const origin = this.originOf(await this.typedServer(args.server));
    const { CredentialStoreError } = await import('../remote/credentials.js');
    const { SignInError } = await import('../remote/device-login.js');
    const { deviceSignIn } = await import('../remote/sign-in.js');
    try {
      const signed = await deviceSignIn(origin, {
        browser: flags.browser,
        tty: process.stdout.isTTY === true,
        insecureStorage: flags['insecure-storage'],
        makeDefault: flags.default,
        // Straight to stderr: the code must show also with --json (oclif silences logToStderr there).
        log: (text) => void process.stderr.write(text),
      });
      const who = signed.email ?? signed.grant.principal;
      this.log(`Signed in to ${serverDisplay(origin)} as ${who}; the token is in the ${signed.store}.`);
      const isDefault = this.reportDefault(origin);
      return { server: origin, ...signed.grant, store: signed.store, default: isDefault };
    } catch (error) {
      if (error instanceof SignInError || error instanceof CredentialStoreError) this.error(error.message, { exit: 1 });
      throw error;
    }
  }

  /** The server as typed, or asked for in a terminal; without either, a usage error. */
  private async typedServer(typed: string | undefined): Promise<string> {
    if (typed !== undefined) return typed;
    const tty = process.stdin.isTTY === true && process.stdout.isTTY === true;
    const asked = tty ? await askServer() : null;
    if (asked === null) this.error(NO_SERVER, { exit: 2 });
    return asked;
  }

  /** Says whether the server is now the default; true when it is. */
  private reportDefault(origin: string): boolean {
    const { default: name } = readProfiles();
    const isDefault = name !== null && nameOrigin(name) === origin;
    if (!isDefault && name !== null) {
      this.log(`The default server stays ${name}; \`${COMMAND} servers use ${origin}\` or --default changes it.`);
    }
    return isDefault;
  }

  private originOf(typed: string): string {
    if (typed.trim().toLowerCase() === CLOUD && !cloudConfigured()) this.error(CLOUD_NOTE, { exit: 1 });
    try {
      return serverOrigin(typed);
    } catch (error) {
      if (error instanceof ServerAddressError) this.error(error.message, { exit: 2 });
      throw error;
    }
  }
}
