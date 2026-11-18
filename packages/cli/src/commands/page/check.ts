import { formatDiagnostic } from '../../lib/diagnostics.js';
import { CoreCommand } from '../../core-command.js';

export default class PageCheck extends CoreCommand {
  static description = 'Validate all pages and components/components.json (core content.validate)';

  static examples = [
    '<%= config.bin %> page check',
    '<%= config.bin %> page check --site a --content ./sample-content',
  ];

  static flags = { ...CoreCommand.siteFlags, ...CoreCommand.contentFlag, ...CoreCommand.inputFlag };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(PageCheck);
    const input = await this.resolveInput(flags.input, async () => ({
      ...(await this.siteInput(flags.site)),
      input: { kind: 'workspace' as const },
    }));
    const result = await this.core.content.validate(input);
    this.noteProvisional(result.provisional);
    for (const diagnostic of result.diagnostics) this.log(formatDiagnostic(diagnostic));
    this.log(`${result.pages} page(s) checked: ${result.errors} error(s), ${result.warnings} warning(s).`);
    if (result.errors > 0) process.exitCode = 1;
    return result;
  }
}
