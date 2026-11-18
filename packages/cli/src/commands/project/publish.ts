// `foliwake project publish` (project-publish.ts), and `foliwake publish` in a linked folder.
import { Args, Command, Flags } from '@oclif/core';

export default class ProjectPublish extends Command {
  static summary = 'Publish the pages your last preview changed (or the pages of the given files and folders) to live';

  static description =
    `In a folder linked to a site: with no paths, the pages the last \`foliwake preview\` of ` +
    `this folder changed, refused when the preview changed since; with paths (files or folders under content/), ` +
    `their pages. Lists them and asks in a terminal; --yes for scripts. --expect sr_… publishes a preview you ` +
    `reviewed elsewhere. In a linked folder, \`foliwake publish\` runs this command.`;

  static examples = [
    '<%= config.bin %> publish',
    '<%= config.bin %> publish content/index.md',
    '<%= config.bin %> publish content/lessons/ --yes',
  ];

  static enableJsonFlag = true;

  static strict = false;

  static args = {
    paths: Args.string({ description: 'files or folders under content/', required: false }),
  };

  static flags = {
    expect: Flags.string({
      description: 'the preview release you reviewed (sr_…); default: the one the last `foliwake preview` here made',
    }),
    yes: Flags.boolean({ description: 'do not ask (scripts)' }),
  };

  async run(): Promise<unknown> {
    const { argv, flags } = await this.parse(ProjectPublish);
    const { publishProject, terminalConfirm } = await import('../../project-publish.js');
    const json = this.jsonEnabled();
    const outcome = await publishProject(
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
