import { Flags } from '@oclif/core';

import { COMMAND } from '../../settings.js';
import { finishedResult } from '../../lib/operation-result.js';
import { CoreCommand } from '../../core-command.js';
import { longWriteReport } from '../../render/operation-result.js';

const C = COMMAND;

export default class CodePrepare extends CoreCommand {
  static description =
    'Copy JS/CSS from a clean commit into an immutable code release; on a site with a live release, live and ' +
    'preview are unchanged. On a site without one it changes live: it makes release 1, this code and no pages, ' +
    'and waits for its cache refresh (core code.prepare)';

  static examples = [
    '<%= config.bin %> code prepare',
    '<%= config.bin %> code prepare --rev feature/hero',
    '<%= config.bin %> code prepare --rev <sha> --json',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    rev: Flags.string({
      description: 'the Git revision to copy, a branch, tag or full SHA (default HEAD); the checkout must be clean',
    }),
    ...CoreCommand.refreshWaitFlag,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(CodePrepare);
    const input = await this.resolveInput(flags.input, async () => ({
      ...(await this.siteInput(flags.site)),
      ...(flags.rev === undefined ? {} : { rev: flags.rev }),
    }));
    // Release 1 of a new site goes live: its cache refresh is awaited (bounded) like any live write's.
    const operation = await this.follow(await this.core.code.prepare(input), {
      wait: true,
      waitTimeout: flags['wait-timeout'],
    });
    const releaseOne = (operation.result as { siteRelease?: string | null } | undefined)?.siteRelease != null;
    const report = longWriteReport(operation, 'Created the site: release 1 with this code and no pages');
    if (!this.jsonEnabled()) {
      if (report.exitCode !== 0 || releaseOne) for (const line of report.lines) this.log(line);
      else {
        const { codeRelease, sourceRevision, message, diagnostics } = finishedResult(operation);
        this.log(`Prepared ${codeRelease} from ${sourceRevision}.${message ? ` ${message}` : ''}`);
        for (const item of diagnostics)
          this.log(`  ${item.severity} ${item.code} ${item.file}:${item.line}:${item.column} ${item.message}`);
        this.log(
          `Live is unchanged. Show it in a branch preview with \`${C} branch update <branch> --code ${codeRelease} ` +
            `--latest-selection\`, rebuild every page against it with \`${C} migration prepare ${codeRelease}\`, or ` +
            `make it live as it is with \`${C} code release ${codeRelease} --latest-live\`.`,
        );
      }
    }
    process.exitCode = report.exitCode;
    return operation;
  }
}
