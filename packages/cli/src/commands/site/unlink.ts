// `foliwake site unlink`: forget this folder's link to a site (connect.ts). No network call.
import { Command, Flags } from '@oclif/core';

export default class SiteUnlink extends Command {
  static summary =
    "Remove this project folder's link to its site (.foliwake/connection.json); the server is not changed";

  static description =
    `Removes .foliwake/connection.json from this folder, so \`foliwake preview\` and \`publish\` ` +
    `no longer go to that site. Nothing is sent to the server: the site, its releases and its pages stay there. ` +
    `Prints the server and site it unlinked. A folder that is not linked is not an error: it says so and exits 0. ` +
    `A connection file this version cannot read is left as it is unless --force. To move a project to another ` +
    `server: \`foliwake site unlink\`, then \`foliwake site create <id> --server <server>\` (or \`site link ` +
    `<id> --server <server>\`).`;

  static examples = [
    '<%= config.bin %> site unlink',
    '<%= config.bin %> site unlink --json',
    '<%= config.bin %> site unlink --force',
  ];

  static enableJsonFlag = true;

  static flags = {
    force: Flags.boolean({ description: 'also remove a .foliwake/connection.json this version cannot read' }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SiteUnlink);
    const { unlinkSite } = await import('../../connect.js');
    const json = this.jsonEnabled();
    const outcome = await unlinkSite(
      { cwd: process.cwd(), force: flags.force, env: process.env },
      { out: (text = '') => (json ? undefined : this.log(text)), err: (text = '') => this.logToStderr(text) },
    );
    process.exitCode = outcome.exit;
    return { unlinked: outcome.unlinked };
  }
}
