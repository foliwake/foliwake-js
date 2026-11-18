import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { credentialListLines } from '../../render/credentials.js';

export default class CredentialList extends CoreCommand {
  static description =
    'Credentials the content sources use: set or not, from the environment or stored; ' +
    'never the value (core credentials.list)';

  static examples = ['<%= config.bin %> credential list', '<%= config.bin %> credential list --site my-site --json'];

  static flags = {
    ...CoreCommand.configFlag,
    site: Flags.string({
      description: "only the credentials this site's sources use (default: every site you administer)",
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(CredentialList);
    const answer = await this.core.credentials.list(flags.site === undefined ? {} : { site: flags.site });
    for (const line of credentialListLines(answer)) this.log(line);
    return answer;
  }
}
