import { Flags } from '@oclif/core';

import { CoreCommand } from '../../core-command.js';

export default class SiteEdit extends CoreCommand {
  static description =
    "Edit a stored site's settings in $VISUAL or $EDITOR; saved only if nobody changed the site meanwhile (core " +
    'sites.update)';

  static examples = ['<%= config.bin %> site edit --site my-site'];

  static flags = {
    ...CoreCommand.siteFlags,
    expect: Flags.integer({
      min: 1,
      description: 'the revision you saw (`site show`); default: the one opened in the editor',
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(SiteEdit);
    const { mkdtemp, readFile, rm, writeFile } = await import('node:fs/promises');
    const { spawnSync } = await import('node:child_process');
    const os = await import('node:os');
    const path = await import('node:path');
    const { isDeepStrictEqual } = await import('node:util');
    const { site } = await this.siteInput(flags.site);
    const current = await this.core.sites.get({ site });
    const editor = process.env.VISUAL || process.env.EDITOR;
    if (!editor) this.error('Set $VISUAL or $EDITOR, or change one setting with `foliwake site set`.', { exit: 2 });
    const dir = await mkdtemp(path.join(os.tmpdir(), 'foliwake-site-'));
    try {
      const file = path.join(dir, `${site}.json`);
      await writeFile(file, `${JSON.stringify(current.entry, null, 2)}\n`, { mode: 0o600 });
      const run = spawnSync(editor, [file], { stdio: 'inherit', shell: true });
      if (run.status !== 0) this.error(`The editor ended with status ${run.status}; nothing was saved.`);
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
      } catch (error) {
        this.error(`Not saved: the edited file is not valid JSON (${(error as Error).message}).`);
      }
      if (isDeepStrictEqual(entry, current.entry)) {
        this.log('No change; nothing was saved.');
        return { site, revision: current.revision };
      }
      const answer = await this.core.sites.update({
        site,
        expect: { revision: flags.expect ?? current.revision },
        entry,
      });
      this.log(`${site}: saved as revision ${answer.revision}. Running services pick it up without a restart.`);
      return answer;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
