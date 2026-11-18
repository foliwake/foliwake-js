// `foliwake org create <id>`: a new organisation (core org.create; the installation's owner only).
import { Args, Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';

export default class OrgCreate extends CoreCommand {
  static description =
    "Create an organisation (the installation's owner only); your account becomes its admin. Sites are then " +
    'created in it with `site create --org <id>` (core org.create)';

  static examples = [
    '<%= config.bin %> org create acme --name "Acme Ltd"',
    '<%= config.bin %> org create acme --json',
  ];

  static args = {
    id: Args.string({
      required: true,
      description:
        'the organisation id: at most 12 lowercase letters, digits and single inner hyphens, starting with a ' +
        'letter (it is part of branch preview hosts and bucket names)',
    }),
  };

  static flags = {
    ...CoreCommand.configFlag,
    name: Flags.string({ description: 'the name people see (default: the id)' }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(OrgCreate);
    const created = await this.core.org.create({ id: args.id, name: flags.name ?? args.id });
    const role = created.membership ? `; you are its ${created.membership.role}` : '';
    this.log(`Created organisation ${created.id} (${created.name})${role}.`);
    this.log(`Create a site in it: \`foliwake site create <id> --org ${created.id}\`.`);
    return created;
  }
}
