import { CoreCommand } from '../../core-command.js';

export default class SiteAdopt extends CoreCommand {
  static description =
    'Bind an existing bucket and its state to a configured site; publishes nothing (core sites.adopt)';

  static examples = ['<%= config.bin %> site adopt --config foliwake.config.json --site my-site'];

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SiteAdopt);
    const input = await this.resolveInput(flags.input, () => this.siteInput(flags.site));
    const result = await this.core.sites.adopt(input);
    this.log(
      result.state === 'noop'
        ? `Site ${result.site} is already bound to its bucket and state; nothing changed.`
        : `Site ${result.site} adopted its ` +
            `bucket${result.state === 'state_attached' ? ' (state directory attached)' : ''}; nothing was published.`,
    );
    if (result.message) this.log(`  ${result.message}`);
    for (const [field, ids] of Object.entries(result.missingProvenance ?? {}))
      if (ids.length)
        this.log(`  Unknown ${field} for code release(s): ${ids.join(', ')} (recorded as unknown, not invented).`);
    return result;
  }
}
