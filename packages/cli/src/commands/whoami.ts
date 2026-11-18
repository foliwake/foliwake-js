import { CoreCommand } from '../core-command.js';
import { type Membership, serverDisplay } from '../remote/servers.js';

const membershipText = (m: Membership): string =>
  `${m.org} (${m.role}${m.live ? ', live' : ''}${m.sites ? `: ${m.sites.join(', ')}` : ''})`;

export default class Whoami extends CoreCommand {
  static description = 'Show the server, who this command acts as and what it may do (core whoami)';

  static examples = [
    '<%= config.bin %> whoami',
    '<%= config.bin %> whoami --server cloud',
    '<%= config.bin %> whoami --json',
  ];

  async run(): Promise<unknown> {
    const grant = await this.core.whoami();
    // Locally (the engine on this computer) no server is called.
    const server = this.local ? null : this.target.origin;
    const organisations = grant.memberships.map(membershipText).join('; ');
    this.log(`Server         ${server ? serverDisplay(server) : 'none (this computer, local configuration)'}`);
    this.log(`Principal      ${grant.principal}`);
    this.log(`Installation   ${grant.installation ? 'yes' : 'no'}`);
    this.log(`Organisations  ${organisations || (grant.installation ? 'all' : 'none')}`);
    return { server, ...grant };
  }
}
