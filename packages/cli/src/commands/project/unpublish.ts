// `foliwake project unpublish` (project-publish.ts).
import { Args, Command, Flags } from '@oclif/core';

export default class ProjectUnpublish extends Command {
  static summary = 'Take the pages of the given files and folders off live';

  static description =
    `In a folder linked to a site: the pages of the given files or folders under content/ go off ` +
    `live, if live is still the release read just before (or --expect). Lists them and asks in a terminal; --yes ` +
    `for scripts.`;

  static examples = ['<%= config.bin %> project unpublish content/old.md'];

  static enableJsonFlag = true;

  static strict = false;

  static args = {
    paths: Args.string({ description: 'files or folders under content/', required: true }),
  };

  static flags = {
    expect: Flags.string({ description: 'the live release you saw (sr_…); default: live as it is now' }),
    yes: Flags.boolean({ description: 'do not ask (scripts)' }),
  };

  async run(): Promise<unknown> {
    const { argv, flags } = await this.parse(ProjectUnpublish);
    const { unpublishProject, terminalConfirm } = await import('../../project-publish.js');
    const json = this.jsonEnabled();
    const outcome = await unpublishProject(
      {
        cwd: process.cwd(),
        env: process.env,
        paths: argv as string[],
        expect: flags.expect,
        yes: flags.yes,
        confirm: json ? null : terminalConfirm(process.stdin, process.stdout),
      },
      { out: (text = '') => (json ? undefined : this.log(text)), err: (text = '') => this.logToStderr(text) },
    );
    process.exitCode = outcome.exit;
    return { pages: outcome.pages, operation: outcome.operation };
  }
}
