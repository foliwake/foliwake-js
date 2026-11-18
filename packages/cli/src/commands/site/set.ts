import { Args, Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';

export default class SiteSet extends CoreCommand {
  static description =
    'Change one setting of a stored site, only if nobody changed the site since it was read (core sites.update)';

  static examples = [
    '<%= config.bin %> site set --site my-site media.resize engine',
    '<%= config.bin %> site set --site my-site branchHostDomain preview.foliwake.example --expect 3',
    '<%= config.bin %> site set --site my-site liveAliases --unset',
  ];

  static args = {
    path: Args.string({
      required: true,
      description: 'dotted settings path, e.g. media.resize or sources.0.settings.folderId',
    }),
    value: Args.string({ description: 'the new value: JSON when it parses (true, 3, ["a"], null), else a string' }),
  };

  static flags = {
    ...CoreCommand.siteFlags,
    expect: Flags.integer({
      min: 1,
      description: 'the revision you saw (`site show`); default: the one read just before the change',
    }),
    unset: Flags.boolean({ description: 'remove the setting instead of setting it' }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(SiteSet);
    if (flags.unset === (args.value !== undefined)) this.error('Give a value, or --unset (not both).', { exit: 2 });
    const { parseValue, withPath } = await import('../../site-entry-edit.js');
    const { site } = await this.siteInput(flags.site);
    const current = await this.core.sites.get({ site });
    const revision = flags.expect ?? current.revision;
    let entry;
    try {
      entry = withPath(current.entry, args.path, flags.unset ? undefined : parseValue(args.value as string));
    } catch (error) {
      this.error((error as Error).message, { exit: 2 });
    }
    const answer = await this.core.sites.update({ site, expect: { revision }, entry });
    this.log(
      `${site}: ${args.path} ${flags.unset ? 'removed' : 'set'}; revision ${answer.revision}. Running services pick ` +
        `it up without a restart.`,
    );
    return answer;
  }
}
