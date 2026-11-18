// `foliwake site delete --site <id>`: remove a site from the server (core sites.delete). Its bucket is kept.
import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';
import { COMMAND } from '../../settings.js';

type Deleted = { site: string; org: string; livePages: number; foldersSetAside: number; bucket: 'kept' };

function resultLines(deleted: Deleted): string[] {
  const pages = deleted.livePages > 0 ? ` Its ${deleted.livePages} live page(s) are no longer served here.` : '';
  return [
    `Deleted site ${deleted.site} (organisation ${deleted.org}) from the server.${pages}`,
    `Its state and code checkout were set aside on the server (${deleted.foldersSetAside} folder(s), ` +
      'renamed `<folder>.deleted-<time>`); the operator removes them.',
    "Its bucket was NOT touched: it still holds the site's pages and releases. The installation's operator " +
      "empties or deletes it with the storage provider's tools; a site with this id can be created again only " +
      'after that.',
    `A folder linked to it keeps its .foliwake/connection.json: \`${COMMAND} site unlink\` there.`,
  ];
}

export default class SiteDelete extends CoreCommand {
  static description =
    'Delete a site from the server (an admin of its organisation): its settings and history go, its state and ' +
    'checkout are set aside, its bucket is kept for the operator to empty. Refused while it works, has live pages ' +
    '(unless --force) or memberships, invitations or CI keys name it (core sites.delete)';

  static examples = [
    '<%= config.bin %> site delete --site old-site',
    '<%= config.bin %> site delete --site old-site --confirm old-site --json',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    confirm: Flags.string({
      description: 'the site id, typed again: confirms without a question (needed without a terminal)',
    }),
    force: Flags.boolean({ description: 'delete a site whose live release has pages (they stop being served)' }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SiteDelete);
    const { site } = await this.siteInput(flags.site);
    const confirm = flags.confirm ?? (await this.askSiteId(site));
    const deleted = await this.core.sites.delete({ site, confirm, ...(flags.force ? { force: true } : {}) });
    if (!this.jsonEnabled()) for (const line of resultLines(deleted)) this.log(line);
    return deleted;
  }

  /** The site id typed in a terminal; without one, --confirm is needed. */
  private async askSiteId(site: string): Promise<string> {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
      this.error('Not a terminal: pass --confirm <site-id> to delete without being asked.', { exit: 2 });
    const { isCancel, text } = await import('@clack/prompts');
    const answer = await text({ message: `Type the site id (${site}) to delete the site`, placeholder: site });
    if (isCancel(answer)) this.error('Cancelled; nothing was changed.', { exit: 1 });
    return String(answer).trim();
  }
}
