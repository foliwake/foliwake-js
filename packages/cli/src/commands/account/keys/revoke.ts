import { Args } from '@oclif/core';

import { CoreCommand } from '../../../core-command.js';

export default class AccountKeysRevoke extends CoreCommand {
  static description =
    'Revoke a key at once: a CI key of an organisation you administer (ci_…), or one of your signed-in ' +
    'computers (key_…) (core account.keys.revoke)';

  static examples = ['<%= config.bin %> account keys revoke ci_0123456789abcdef'];

  static args = { key: Args.string({ description: 'the key ID, as `account keys list` shows it', required: true }) };

  static flags = { ...CoreCommand.configFlag };

  async run(): Promise<unknown> {
    const { args } = await this.parse(AccountKeysRevoke);
    await this.core.account.keys.revoke({ key: args.key });
    this.log(`Revoked ${args.key}; it no longer works.`);
    return { revoked: args.key };
  }
}
