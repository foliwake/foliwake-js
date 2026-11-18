import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { longWriteReport } from '../../render/operation-result.js';

export default class PageUnpreview extends CoreCommand {
  static description =
    'Remove a page from the preview, live untouched: a page that is not live leaves the preview, a live page shows ' +
    'its live version there again. Refused when the preview is not the one you expected (core channels.unpreview)';

  static examples = [
    '<%= config.bin %> page unpreview --path /lessons/signs/ru --expect sr_…   # the preview release `site status` ' +
      'shows',
    '<%= config.bin %> page unpreview --path /old-draft --latest-preview',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    path: Flags.string({ description: 'the path of the page in the preview', required: true }),
    expect: Flags.string({
      description:
        'the preview site release you saw (sr_…, as `site status` shows it); refused when the preview is another one',
      exclusive: ['latest-preview'],
    }),
    'latest-preview': Flags.boolean({
      description: 'expect the preview as it is now (read once, before the request)',
      exclusive: ['expect'],
    }),
    ...CoreCommand.refreshWaitFlag,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(PageUnpreview);
    const input = await this.resolveInput(flags.input, async () => {
      const { site } = await this.siteInput(flags.site);
      return { site, path: flags.path, expect: { preview: await this.expectedPreview(site, flags) } };
    });
    const operation = await this.follow(await this.core.channels.unpreview(input), {
      wait: true,
      waitTimeout: flags['wait-timeout'],
    });
    const report = longWriteReport(operation, `Removed ${flags.path} from the preview`);
    if (!this.jsonEnabled()) for (const line of report.lines) this.log(line);
    process.exitCode = report.exitCode;
    return operation;
  }

  /** `expect.preview`: `--expect`, or with `--latest-preview` the preview release read now (not again later). */
  private async expectedPreview(
    site: string,
    flags: { expect?: string | undefined; 'latest-preview'?: boolean | undefined },
  ): Promise<string> {
    if (flags.expect !== undefined) return flags.expect;
    if (!flags['latest-preview'])
      this.error(
        'Name the preview release you expect: --expect <sr_…> (as `site status` shows it), or --latest-preview.',
        { exit: 2 },
      );
    const { preview } = await this.core.sites.status({ site });
    if (!preview) this.error('This site has no preview yet; nothing to remove.');
    return preview.site_release;
  }
}
