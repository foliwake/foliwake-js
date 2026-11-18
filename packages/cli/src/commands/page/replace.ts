import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { terminalConfirm } from '../../project-publish.js';

export default class PageReplace extends CoreCommand {
  static description =
    'Let another item of its source feed a published page (e.g. a Drive file deleted and uploaded again): the page ' +
    'keeps its ID, address, live version and history. Shows the plan and asks first; preview and live are ' +
    'unchanged until the next sync and preview/publish (core sources.replacePage)';

  static examples = [
    '<%= config.bin %> page replace --path /lessons/signs/ru --with 1AbCdEfGhIjK',
    '<%= config.bin %> page replace --site my-site --path /lessons/signs/ru --with 1AbCdEfGhIjK --yes',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    path: Flags.string({ description: 'the path of the page that is live or in preview', required: true }),
    with: Flags.string({
      description:
        'the native ID of the source item that should feed it (a Drive file ID; `source sync --json` lists the ' +
        "items' native_id)",
      required: true,
    }),
    yes: Flags.boolean({ description: 'apply the plan without asking (required when not in a terminal)' }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(PageReplace);
    const input = { ...(await this.siteInput(flags.site)), path: flags.path, with: flags.with };
    const planned = await this.core.sources.replacePage({ ...input, confirm: false });
    const { plan } = planned;
    const show = (document: string | null, nativeId: string) =>
      document === null ? nativeId : `${document} (${nativeId})`;
    if (!this.jsonEnabled()) {
      this.log(`Page ${plan.pageId} at ${plan.path} (${plan.channels.join(' and ')}), source ${plan.source}:`);
      this.log(
        `  fed now by:  ` +
          `${show(plan.from.document, plan.from.nativeId)}${plan.from.present ? '' : ' (no longer in the source)'}`,
      );
      this.log(`  will be fed: ${show(plan.to.document, plan.to.nativeId)}, which reads as ${plan.to.path}`);
      if (plan.drops !== null) this.log(`  the unpublished page ${plan.drops} loses this item`);
      for (const warning of planned.warnings) this.log(`  ${warning.code}: ${warning.message}`);
    }
    if (!flags.yes) {
      const confirm = terminalConfirm(process.stdin, process.stdout);
      if (!confirm) this.error('Not in a terminal: add --yes to apply this plan.', { exit: 2 });
      if (!(await confirm(`Replace the item that feeds ${plan.pageId}?`))) {
        if (!this.jsonEnabled()) this.log('Nothing was changed.');
        return planned;
      }
    }
    const applied = await this.core.sources.replacePage({
      ...input,
      confirm: true,
      expect: { pageId: plan.pageId, from: plan.from.nativeId },
    });
    if (!this.jsonEnabled())
      this.log(
        `Done: ${show(applied.plan.to.document, applied.plan.to.nativeId)} now feeds page ${applied.plan.pageId}. ` +
          `Sync source ${applied.plan.source} next; the page then previews and publishes from it (live is unchanged ` +
          `until you publish).`,
      );
    return applied;
  }
}
