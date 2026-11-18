// `foliwake site link <id>`: link this project folder to an existing site (connect.ts).
import { Args, Command, Flags } from '@oclif/core';

export default class SiteLink extends Command {
  static summary = 'Link this project folder to an existing site on your Foliwake server (developer or admin)';

  static description =
    `Signed in with \`foliwake login\` to any Foliwake server: checks that the site exists and ` +
    `that you are a developer or admin of its organisation, and writes .foliwake/connection.json in this folder. ` +
    `Nothing changes on the server. A second developer who cloned the repository only links.`;

  static examples = [
    '<%= config.bin %> site link mytest',
    '<%= config.bin %> site link mytest --server foliwake.example',
  ];

  static enableJsonFlag = true;

  static args = {
    id: Args.string({ required: true, description: 'the site id on the server' }),
  };

  static flags = {
    server: Flags.string({
      description:
        'the Foliwake server (origin, host, or `cloud` for Foliwake Cloud; default: $FOLIWAKE_SERVER, else the only ' +
        'server you are signed in to; several: asked in a terminal, refused without one)',
    }),
    relink: Flags.boolean({
      description:
        'replace the link of this folder (.foliwake/connection.json) to another server or site without asking',
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(SiteLink);
    const { linkSite } = await import('../../connect.js');
    const json = this.jsonEnabled();
    const { terminalQuestions } = await import('../../connect-prompts.js');
    const questions = terminalQuestions({ input: process.stdin, output: process.stdout }, { ask: !json });
    const outcome = await linkSite(
      { cwd: process.cwd(), server: flags.server, site: args.id, env: process.env, relink: flags.relink, ...questions },
      { out: (text = '') => (json ? undefined : this.log(text)), err: (text = '') => this.logToStderr(text) },
    );
    process.exitCode = outcome.exit;
    return { server: outcome.server, site: outcome.site };
  }
}
