// `foliwake org list`: the organisations of the signed-in account, with its role there (core org.list).
import { CoreCommand } from '../../core-command.js';

type Org = { id: string; name: string; membership: { role: string; live: boolean; sites: string[] | null } | null };

function lineOf(org: Org): string {
  const name = org.name && org.name !== org.id ? ` (${org.name})` : '';
  const member = org.membership;
  if (!member) return `${org.id}${name}  installation, no membership`;
  const live = member.role === 'developer' && member.live ? ', live' : '';
  const sites = member.sites === null ? 'every site' : `sites ${member.sites.join(', ')}`;
  return `${org.id}${name}  ${member.role}${live}, ${sites}`;
}

export default class OrgList extends CoreCommand {
  static description =
    "The organisations you are a member of, with your role (the installation's owner sees every one; core org.list)";

  static examples = ['<%= config.bin %> org list', '<%= config.bin %> org list --json'];

  static flags = { ...CoreCommand.configFlag };

  async run(): Promise<unknown> {
    await this.parse(OrgList);
    const orgs = await this.core.org.list();
    for (const org of orgs) this.log(lineOf(org));
    if (orgs.length === 0) this.log('No organisations.');
    return orgs;
  }
}
