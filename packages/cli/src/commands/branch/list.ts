import { CoreCommand } from '../../core-command.js';
import { branchListLines } from '../../render/branches.js';

export default class BranchList extends CoreCommand {
  static description = 'Branches, their code and preview URLs (core branches.list)';

  static examples = ['<%= config.bin %> branch list', '<%= config.bin %> branch list --site a --json'];

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(BranchList);
    const input = await this.resolveInput(flags.input, () => this.siteInput(flags.site));
    const rows = await this.core.branches.list(input);
    for (const line of branchListLines(rows)) this.log(line);
    return rows;
  }
}
