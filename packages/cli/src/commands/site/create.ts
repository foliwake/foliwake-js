// `foliwake site create <id>`: create this project's site on the signed-in server (connect.ts).
// Not a CoreCommand: it never runs against a local configuration, the folder's included.
import { Args, Command, Flags } from '@oclif/core';

export default class SiteCreate extends Command {
  static summary = "Create this project's site on your Foliwake server (core sites.create; admin)";

  static description =
    `In a project folder (as \`foliwake create\` makes it), signed in with \`foliwake login\` to ` +
    `any Foliwake server: creates the site in your organisation (you must be its admin), with release 1 from the ` +
    `folder's last commit (its code and pages, sent as a Git bundle), links the folder to it and prints what to ` +
    `set up next (GitHub, workflows, content sources). Nothing on GitHub is changed. To use a site that exists ` +
    `already: \`foliwake site link <id>\`.`;

  static examples = [
    '<%= config.bin %> site create mytest',
    '<%= config.bin %> site create mytest --repository https://github.com/acme/mytest',
    '<%= config.bin %> site create mytest --server foliwake.example --no-code',
  ];

  static enableJsonFlag = true;

  static args = {
    id: Args.string({
      required: true,
      description:
        'the new site id: at most 12 lowercase letters, digits and single inner hyphens, starting with a letter',
    }),
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
    org: Flags.string({ description: 'the organisation (default: your only one where you are admin)' }),
    repository: Flags.string({
      description: "where the code will live, e.g. https://github.com/acme/mytest (the server checkout's origin)",
    }),
    code: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'send the last commit for release 1 (--no-code: release 1 waits for the first code prepare)',
    }),
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse(SiteCreate);
    const { createSite } = await import('../../connect.js');
    const json = this.jsonEnabled();
    const { terminalQuestions } = await import('../../connect-prompts.js');
    const questions = terminalQuestions({ input: process.stdin, output: process.stdout }, { ask: !json });
    const outcome = await createSite(
      {
        cwd: process.cwd(),
        server: flags.server,
        site: args.id,
        org: flags.org,
        repository: flags.repository ?? null,
        code: flags.code,
        env: process.env,
        relink: flags.relink,
        ...questions,
      },
      { out: (text = '') => (json ? undefined : this.log(text)), err: (text = '') => this.logToStderr(text) },
    );
    process.exitCode = outcome.exit;
    return { server: outcome.server, operation: outcome.operation, result: outcome.result };
  }
}
