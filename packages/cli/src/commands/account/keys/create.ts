import { Flags } from '@oclif/core';

import { COMMAND } from '../../../settings.js';
import { CoreCommand } from '../../../core-command.js';

const C = COMMAND;

export default class AccountKeysCreate extends CoreCommand {
  static description =
    'Make a CI key: it may only deploy code and update branch previews of the named sites (role ci); ' +
    'shown once, kept as a hash (core account.keys.create)';

  static examples = [
    '<%= config.bin %> account keys create --site my-site --label "GitHub Actions" --server https://admin.example.com',
  ];

  static flags = {
    ...CoreCommand.configFlag,
    site: Flags.string({
      description: 'a site the key may release code of (repeat for several)',
      multiple: true,
      required: true,
    }),
    label: Flags.string({
      description: 'what the key is for, e.g. the pipeline (shown in `account keys list`)',
      required: true,
    }),
    org: Flags.string({ description: 'the organisation of the sites (default: the only one you administer)' }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(AccountKeysCreate);
    const input = { sites: flags.site, label: flags.label, ...(flags.org === undefined ? {} : { org: flags.org }) };
    const answer = await this.core.account.keys.create(input);
    const { ciKey } = answer;
    this.log(`CI key ${ciKey.id} for ${ciKey.sites.join(', ')} in ${ciKey.org} (${ciKey.label}).`);
    this.log('Store it now as a secret of the pipeline; it is not shown again:');
    this.log(`  FOLIWAKE_TOKEN=${answer.key}`);
    this.log('The pipeline also sets FOLIWAKE_SERVER to this server.');
    this.log(`Revoke it with \`${C} account keys revoke ${ciKey.id}\`.`);
    return answer;
  }
}
