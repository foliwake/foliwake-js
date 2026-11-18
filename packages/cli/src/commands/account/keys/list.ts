import { CoreCommand } from '../../../core-command.js';

const when = (ms: number | null): string => (ms === null ? 'never' : new Date(ms).toISOString());

export default class AccountKeysList extends CoreCommand {
  static description =
    'Your signed-in computers and the CI keys of the organisations you administer; never a key itself ' +
    '(core account.keys.list and account.keys.ci)';

  static examples = ['<%= config.bin %> account keys list', '<%= config.bin %> account keys list --json'];

  static flags = { ...CoreCommand.configFlag };

  async run(): Promise<unknown> {
    await this.parse(AccountKeysList);
    const ci = await this.core.account.keys.ci();
    const computers = await this.core.account.keys.list().catch(() => []);
    for (const key of computers) {
      this.log(`${key.id}  computer ${key.name} (${key.client}), last used ${when(key.lastUsedAt)}`);
    }
    for (const key of ci) {
      const scope = `${key.sites.join(', ')} in ${key.org}`;
      this.log(`${key.id}  CI ${key.label}: ${scope}, made by ${key.createdBy}, last used ${when(key.lastUsedAt)}`);
    }
    if (computers.length === 0 && ci.length === 0) this.log('No keys.');
    return { computers, ci };
  }
}
