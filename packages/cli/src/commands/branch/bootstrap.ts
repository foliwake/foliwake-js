import { CoreCommand } from '../../core-command.js';
import { branchUrls, branchWriteReport } from '../../render/branch-write.js';

export default class BranchBootstrap extends CoreCommand {
  static description =
    'Once: seed the default branch preview from live code; a no-op when it exists (core branches.bootstrap)';

  static examples = ['<%= config.bin %> branch bootstrap', '<%= config.bin %> branch bootstrap --site a --json'];

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(BranchBootstrap);
    const input = await this.resolveInput(flags.input, () => this.siteInput(flags.site));
    const operation = await this.follow(await this.core.branches.bootstrap(input), {
      wait: false,
      waitTimeout: undefined,
    });
    const report = branchWriteReport(operation, (result) => [
      `Branch ${result.branch} now previews live code ${result.codeRelease}: ${branchUrls(result)}`,
    ]);
    if (!this.jsonEnabled()) for (const line of report.lines) this.log(line);
    process.exitCode = report.exitCode;
    return operation;
  }
}
