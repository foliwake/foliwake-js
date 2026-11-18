// `foliwake project preview`, and `foliwake preview` in a folder linked to a site
// (command-words.ts routes it here; project-preview.ts).
import { Command } from '@oclif/core';

export default class ProjectPreview extends Command {
  static summary = "Preview this project's pages on its site's server (a folder linked with site create / site link)";

  static description =
    `Sends the pages and images of content/ (committed or not) and the code of the last commit ` +
    `(components/, scripts/ and styles/ must be committed) to the site this folder is linked to, rebuilds the ` +
    `site's preview there and prints its address. In a linked folder, \`foliwake preview\` runs this command. ` +
    `Remembers the preview in .foliwake/last-preview.json.`;

  static examples = ['<%= config.bin %> preview', '<%= config.bin %> project preview --json'];

  static enableJsonFlag = true;

  async run(): Promise<unknown> {
    await this.parse(ProjectPreview);
    const { previewProject } = await import('../../project-preview.js');
    const json = this.jsonEnabled();
    const outcome = await previewProject(
      { cwd: process.cwd(), env: process.env },
      { out: (text = '') => (json ? undefined : this.log(text)), err: (text = '') => this.logToStderr(text) },
    );
    process.exitCode = outcome.exit;
    return { siteRelease: outcome.siteRelease, previewUrl: outcome.previewUrl };
  }
}
