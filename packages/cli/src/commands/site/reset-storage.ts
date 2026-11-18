import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { resetPlanLines, resetResultLines } from '../../render/reset-storage.js';

export default class SiteResetStorage extends CoreCommand {
  static description =
    "Recreate a site's storage in one action: archive its state, delete its objects in its own bucket, bind both " +
    'again, prepare its code (release 1) and sync its sources. Publishes nothing: live is EMPTY (no pages) until ' +
    "you publish again. Prints the plan first and asks for the site id (the installation's owner only; core " +
    'sites.resetStorage)';

  static examples = [
    '<%= config.bin %> site reset-storage --site my-site --dry-run',
    '<%= config.bin %> site reset-storage --site my-site',
    '<%= config.bin %> site reset-storage --site my-site --confirm my-site --json',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    confirm: Flags.string({
      description: 'the site id, typed again: confirms the reset without a question (needed without a terminal)',
    }),
    'dry-run': Flags.boolean({ description: 'print the plan (what is lost, what is done) and change nothing' }),
    rev: Flags.string({
      description: 'the commit to prepare again (default: the commit live code came from, else HEAD)',
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SiteResetStorage);
    const { site } = await this.siteInput(flags.site);
    const plan = await this.core.sites.resetStoragePlan({ site });
    if (!this.jsonEnabled()) for (const line of resetPlanLines(plan)) this.log(line);
    if (flags['dry-run']) return plan;
    const confirm = flags.confirm ?? (await this.askSiteId(site));
    // Working-folder sources are synced as `source sync` syncs them.
    const accepted = await this.core.sites.resetStorage({
      site,
      confirm,
      allowWorkingFolder: true,
      ...(flags.rev === undefined ? {} : { rev: flags.rev }),
    });
    const operation = await this.follow(accepted, { wait: false, waitTimeout: undefined });
    if (!this.jsonEnabled()) for (const line of resetResultLines(operation)) this.log(line);
    process.exitCode = operation.state === 'succeeded' ? 0 : 1;
    return operation;
  }

  /** The site id typed in a terminal; without one, --confirm is needed. */
  private async askSiteId(site: string): Promise<string> {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
      this.error('Not a terminal: pass --confirm <site-id> to reset without being asked.', { exit: 2 });
    const { isCancel, text } = await import('@clack/prompts');
    const answer = await text({
      message: `Type the site id (${site}) to delete its storage and archive its state`,
      placeholder: site,
    });
    if (isCancel(answer)) this.error('Cancelled; nothing was changed.', { exit: 1 });
    return String(answer).trim();
  }
}
