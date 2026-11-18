import { Args, Command, Flags } from '@oclif/core';

import { ServerAddressError, defaultOrigin, serverDisplay, serverOrigin } from '../remote/servers.js';
import { COMMAND } from '../settings.js';

const NOT_REVOKED_HINT = 'it then stays valid until 90 days after its last use';

export default class Logout extends Command {
  static description = 'Revoke this computer’s sign-in to a Foliwake server and forget its token';

  static examples = [
    '<%= config.bin %> logout',
    '<%= config.bin %> logout https://foliwake.example',
    '<%= config.bin %> logout cloud',
  ];

  static enableJsonFlag = true;

  static args = { server: Args.string({ description: 'server origin or host (default: the default server)' }) };

  static flags = {
    'forget-only': Flags.boolean({
      description:
        'forget the token here even when the server cannot revoke it (it then stays valid there until it expires)',
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(Logout);
    const origin = this.originOf(args.server);
    if (origin === null) this.error('This computer is not signed in to any server.', { exit: 1 });
    const { forgetSignIn, storedSignIn } = await import('../remote/session.js');
    const { revokeToken } = await import('../remote/device-login.js');
    // The sign-in kept for this server, also one issued elsewhere (the name `cloud` moved since).
    const signIn = storedSignIn(origin);
    if (!signIn) this.error(`This computer is not signed in to ${serverDisplay(origin)}.`, { exit: 1 });
    // A token is revoked only where it was issued: for a moved sign-in, that is its old origin.
    const issuer = signIn.issuer;
    const moved = issuer !== null && issuer !== origin;
    const where = moved ? ` at ${issuer}, where it was issued (${signIn.key} now means ${origin})` : '';
    if (issuer === null && !flags['forget-only']) {
      this.error(
        `This computer's sign-in to ${signIn.key} does not say where it was issued, so its token is not sent ` +
          `anywhere to be revoked. Pass --forget-only to forget it here (${NOT_REVOKED_HINT}).`,
        { exit: 1 },
      );
    }
    // Revoked first: a token forgotten here but still valid there could not be revoked any more.
    const revoked = issuer !== null && signIn.token !== null && (await revokeToken(issuer, signIn.token));
    if (!revoked && signIn.token !== null && !flags['forget-only']) {
      this.error(
        `${issuer ?? origin} could not revoke the token, so it is kept here to try again. Run ` +
          `\`${COMMAND} logout\` again later, or pass --forget-only to forget it anyway ` +
          '(it then stays valid there until 90 days after its last use).',
        { exit: 1 },
      );
    }
    forgetSignIn(origin);
    if (!revoked) process.stderr.write(`Warning: the token was not revoked${where}; it was forgotten here only.\n`);
    this.log(`Signed out of ${serverDisplay(origin)}${revoked && where ? `; the token was revoked${where}` : ''}.`);
    return { server: origin, revoked };
  }

  private originOf(typed: string | undefined): string | null {
    try {
      return typed === undefined ? defaultOrigin() : serverOrigin(typed);
    } catch (error) {
      if (error instanceof ServerAddressError) this.error(error.message, { exit: 2 });
      throw error;
    }
  }
}
