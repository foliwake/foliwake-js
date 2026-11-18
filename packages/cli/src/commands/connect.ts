// `foliwake connect`: link this project folder to a site, new or existing, in one step. In a terminal it asks
// (server, sign-in when needed, then «create a new site or link an existing one?»); without one it takes
// --create <id> or --link <id>. It runs the same code as `site create` and `site link` (create-connect.ts).
import { execFileSync } from 'node:child_process';

import { Command, Flags } from '@oclif/core';

import { ServerAddressError, serverOrigin } from '../remote/servers.js';
import { COMMAND } from '../settings.js';

type Linked = { server: string | null; site: string; created: boolean };

/** Whether the folder's Git repository has a commit (a new site gets its first code from it). */
function hasCommit(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export default class Connect extends Command {
  static summary = 'Link this project folder to a site on your Foliwake server: a new one or an existing one';

  static description =
    `In a terminal: asks which server (signing in first when needed), then whether to create a new site ` +
    `(as \`${COMMAND} site create\`, the folder name as its id) or link one you may develop (as ` +
    `\`${COMMAND} site link\`). Without a terminal, or with --no-interactive: --create <id> or --link <id>. ` +
    `A folder linked already is refused; --force replaces its link, \`${COMMAND} site unlink\` removes it.`;

  static examples = [
    '<%= config.bin %> connect',
    '<%= config.bin %> connect --create mysite --server https://foliwake.example',
    '<%= config.bin %> connect --create mysite --org acme --repository https://github.com/acme/mysite',
    '<%= config.bin %> connect --link docs-en --json',
  ];

  static enableJsonFlag = true;

  static flags = {
    create: Flags.string({ exclusive: ['link'], description: 'create this new site and link the folder to it' }),
    link: Flags.string({ exclusive: ['create'], description: 'link the folder to this existing site' }),
    server: Flags.string({
      description: 'the Foliwake server (origin or host; default: $FOLIWAKE_SERVER, else asked or the only one)',
    }),
    org: Flags.string({
      dependsOn: ['create'],
      description:
        "the new site's organisation (default: the only one where you may create sites; several: asked in a " +
        'terminal, refused without one)',
    }),
    repository: Flags.string({
      dependsOn: ['create'],
      description:
        "the new site's repository (default: this folder's Git origin as an https:// address; `none`: no " +
        'repository yet)',
    }),
    force: Flags.boolean({ description: 'replace the link of a folder that is linked already' }),
    interactive: Flags.boolean({
      allowNo: true,
      description: 'ask for what the flags leave open (default: only when stdin and stdout are a terminal)',
    }),
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(Connect);
    const cwd = process.cwd();
    await this.refuseLinked(cwd, flags.force);
    const interactive = this.interactiveOf(flags.interactive);
    if (!interactive && flags.create === undefined && flags.link === undefined) {
      this.error('Without a terminal, say what to do: --create <id> or --link <id>.', { exit: 2 });
    }
    const json = this.jsonEnabled();
    let linked: Linked | null = null;
    const exit = await this.connect(cwd, flags, interactive, json, (value) => (linked = value));
    process.exitCode = exit ?? 1;
    if (exit === null && !json) this.log(`Not connected; run \`${COMMAND} connect\` again when you are ready.`);
    return linked ?? { server: null, site: null, created: false };
  }

  private interactiveOf(asked: boolean | undefined): boolean {
    const tty = process.stdin.isTTY === true && process.stdout.isTTY === true;
    return (asked ?? tty) && !this.jsonEnabled() && tty;
  }

  private async refuseLinked(cwd: string, force: boolean): Promise<void> {
    const { describeLink, existingLink } = await import('../connect.js');
    const link = await existingLink(cwd);
    if (link === null || force) return;
    this.error(
      `This folder is linked to ${describeLink(link)} already (.foliwake/connection.json). Pass --force to ` +
        `replace that link, or remove it first with \`${COMMAND} site unlink\`.`,
      { exit: 1 },
    );
  }

  private async connect(
    cwd: string,
    flags: { create?: string; link?: string; server?: string; force: boolean; org?: string; repository?: string },
    interactive: boolean,
    json: boolean,
    onLinked: (linked: Linked) => void,
  ): Promise<number | null> {
    const { connectStep } = await import('../create-connect.js');
    const { signInHere } = await import('../remote/sign-in-here.js');
    const say = (text = '') => (json ? undefined : this.log(text));
    const io = { out: say, err: (text = '') => this.logToStderr(text) };
    const step = {
      target: cwd,
      siteId: flags.create ?? null,
      committed: hasCommit(cwd),
      interactive,
      createSite: flags.create !== undefined,
      linkSite: flags.link,
      server: flags.server === undefined ? undefined : this.originOf(flags.server),
      relink: flags.force,
      org: flags.org,
      repository: flags.repository,
      prompts: { input: process.stdin, output: process.stdout },
      signIn: signInHere,
      onLinked,
    };
    return connectStep(step, io);
  }

  private originOf(typed: string): string {
    try {
      return serverOrigin(typed);
    } catch (error) {
      if (error instanceof ServerAddressError) this.error(error.message, { exit: 2 });
      throw error;
    }
  }
}
