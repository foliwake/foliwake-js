import { Args } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { credentialRemoveLines } from '../../render/credentials.js';

export default class CredentialRm extends CoreCommand {
  static description =
    "Removes a stored credential (the installation's owner); refused while a source uses it (core credentials.remove)";

  static examples = ['<%= config.bin %> credential rm OLD_DRIVE_KEY'];

  static args = {
    name: Args.string({ description: 'the credential name, such as FOLIWAKE_GOOGLE_SA_KEY', required: true }),
  };

  static flags = { ...CoreCommand.configFlag };

  async run(): Promise<unknown> {
    const { args } = await this.parse(CredentialRm);
    const answer = await this.core.credentials.remove({ name: args.name });
    for (const line of credentialRemoveLines(answer)) this.log(line);
    return answer;
  }
}
