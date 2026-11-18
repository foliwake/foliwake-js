import { Args, Command, Flags } from '@oclif/core';

import { CLOUD_ORIGIN, DEFAULT_SERVER, ServerAddressError, serverDisplay, serverOrigin } from '../remote/servers.js';

export default class Login extends Command {
  static description = 'Sign this computer in to a Foliwake server through the browser (device code)';

  static examples = [
    '<%= config.bin %> login',
    '<%= config.bin %> login cloud',
    '<%= config.bin %> login http://localhost:8080',
    '<%= config.bin %> login https://foliwake.example',
    '<%= config.bin %> login 127.0.0.1:8098 --no-browser',
  ];

  static enableJsonFlag = true;

  static args = {
    server: Args.string({
      description: `server origin or host, or "cloud" for Foliwake Cloud (${CLOUD_ORIGIN}; default: ${DEFAULT_SERVER})`,
    }),
  };

  static flags = {
    browser: Flags.boolean({
      description: 'open the approval page in the browser (--no-browser only prints its address)',
      default: true,
      allowNo: true,
    }),
    'insecure-storage': Flags.boolean({
      description: 'keep the token in a 0600 file when there is no system keychain',
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(Login);
    const origin = this.originOf(args.server ?? DEFAULT_SERVER);
    const { CredentialStoreError } = await import('../remote/credentials.js');
    const { SignInError } = await import('../remote/device-login.js');
    const { deviceSignIn } = await import('../remote/sign-in.js');
    try {
      const signed = await deviceSignIn(origin, {
        browser: flags.browser,
        tty: process.stdout.isTTY === true,
        insecureStorage: flags['insecure-storage'],
        // Straight to stderr: the code must show also with --json (oclif silences logToStderr there).
        log: (text) => void process.stderr.write(text),
      });
      const who = signed.email ?? signed.grant.principal;
      this.log(`Signed in to ${serverDisplay(origin)} as ${who}; the token is in the ${signed.store}.`);
      return { server: origin, ...signed.grant, store: signed.store };
    } catch (error) {
      if (error instanceof SignInError || error instanceof CredentialStoreError) this.error(error.message, { exit: 1 });
      throw error;
    }
  }

  private originOf(typed: string): string {
    try {
      return serverOrigin(typed);
    } catch (error) {
      if (error instanceof ServerAddressError) this.error(error.message, { exit: 2 });
      throw error;
    }
  }
}
