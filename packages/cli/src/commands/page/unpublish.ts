import { Args } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { longWriteReport } from '../../render/operation-result.js';

export default class PageUnpublish extends CoreCommand {
  static description =
    'Remove pages from the live site; refused when live is not the release you expected (core channels.unpublish)';

  static examples = [
    '<%= config.bin %> page unpublish help --expect sr_…   # the live release `site status` shows',
    '<%= config.bin %> page unpublish old-page other --latest-live',
  ];

  static strict = false;

  static args = { pages: Args.string({ description: 'page IDs to take off live', required: true }) };

  static flags = {
    ...CoreCommand.siteFlags,
    ...CoreCommand.expectLiveFlags,
    ...CoreCommand.refreshWaitFlag,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags, argv } = await this.parse(PageUnpublish);
    const pages = argv.map(String);
    const input = await this.resolveInput(flags.input, async () => {
      const { site } = await this.siteInput(flags.site);
      return { site, pages, expect: { live: await this.expectedLive(site, flags) } };
    });
    const operation = await this.follow(await this.core.channels.unpublish(input), {
      wait: true,
      waitTimeout: flags['wait-timeout'],
    });
    const report = longWriteReport(operation, `Unpublished ${pages.join(', ')}`);
    if (!this.jsonEnabled()) for (const line of report.lines) this.log(line);
    process.exitCode = report.exitCode;
    return operation;
  }
}
