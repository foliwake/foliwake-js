// `foliwake create [<folder>]`: create-foliwake's new site frontend, then «Connect to a Foliwake server?»
// (`site create` or `site link` in the new folder). Reads no project configuration; only its last step reads
// this computer's sign-ins and may sign in, as `login` does.
import { Args, Command, Flags } from '@oclif/core';
import type { CreateRequest, CreateResult } from 'create-foliwake';

export default class Create extends Command {
  static summary = 'Create a new site frontend: blocks, styles, local pages, checks and workflows';

  static description =
    `Runs create-foliwake (\`npm create foliwake\`): asks in a terminal only for what the flags ` +
    `leave open; without a terminal (or with --no-interactive) it uses the defaults: folder foliwake-site, template ` +
    `minimal, no site id, no React, no Storybook, Git repository with a first commit.
The project is checked with @foliwake/site-check before anything is written.
A non-empty folder is refused unless you choose --overwrite or --keep-existing; .git is never touched.
At the end it can create or link the site on your Foliwake server (--create-site, --link-site, or a question).`;

  static examples = [
    '<%= config.bin %> create',
    '<%= config.bin %> create my-site',
    '<%= config.bin %> create my-site --template examples --site my-site --no-interactive',
    '<%= config.bin %> create my-site --react --storybook',
    '<%= config.bin %> create . --overwrite --no-git',
    '<%= config.bin %> create mytest --no-interactive --server http://localhost:8080 --create-site',
  ];

  static args = {
    folder: Args.string({
      description: 'folder of the new project (default: foliwake-site); "." for the current folder',
    }),
  };

  static flags = {
    template: Flags.string({
      options: ['minimal', 'examples'],
      description:
        'minimal: one page and one block (default); examples: two pages and three blocks, one with JavaScript',
    }),
    site: Flags.string({
      description: 'the site id on your Foliwake server, if you know it (the README uses it); empty: none',
    }),
    react: Flags.boolean({
      allowNo: true,
      description:
        'add React support: React and ReactDOM vendored in scripts/vendor/ and the React example block poll; ' +
        'default: asked in a terminal, else no',
    }),
    storybook: Flags.boolean({
      allowNo: true,
      description: 'add Storybook for the blocks: .storybook/ and npm scripts; default: asked in a terminal, else no',
    }),
    install: Flags.boolean({
      allowNo: true,
      description: "install Storybook's npm packages; default: asked in a terminal after Storybook, else no",
    }),
    git: Flags.boolean({
      allowNo: true,
      description:
        'create a Git repository (branch main) and commit the project with your Git identity (default: yes); ' +
        'skipped inside an existing repository',
    }),
    overwrite: Flags.boolean({
      exclusive: ['keep-existing'],
      description: 'the folder is not empty: remove its files first (.git is kept)',
    }),
    'keep-existing': Flags.boolean({
      exclusive: ['overwrite'],
      description: 'the folder is not empty: add the project next to its files (refused if one would be replaced)',
    }),
    'create-site': Flags.boolean({
      exclusive: ['link-site'],
      description: 'at the end, create the site (id: --site, else the folder name) on your server, as `site create`',
    }),
    'link-site': Flags.string({
      exclusive: ['create-site'],
      description: 'at the end, link the project to this existing site on your Foliwake server, as `site link`',
    }),
    server: Flags.string({
      description:
        'the Foliwake server to connect to (origin, host, or `cloud`; default: $FOLIWAKE_SERVER, else asked ' +
        'in a terminal; without one, the only server you are signed in to — several are refused)',
    }),
    relink: Flags.boolean({
      description: 'with --create-site or --link-site in a folder already linked elsewhere: replace that link',
    }),
    connect: Flags.boolean({
      allowNo: true,
      description: '--no-connect: never ask «Connect to a Foliwake server?» (default: asked at the end in a terminal)',
    }),
    interactive: Flags.boolean({
      allowNo: true,
      description: 'ask for missing values (default: only when stdin and stdout are a terminal)',
    }),
    help: Flags.help({ char: 'h' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Create);
    const server = await this.serverOf(flags.server);
    const linking = flags['create-site'] || flags['link-site'] !== undefined || server !== undefined;
    if (flags.connect === false && linking) {
      this.error('--no-connect conflicts with --create-site, --link-site and --server: choose one.', { exit: 2 });
    }
    const request: CreateRequest = {
      folder: args.folder,
      template: flags.template as CreateRequest['template'],
      site: flags.site,
      git: flags.git,
      storybook: flags.storybook,
      install: flags.install,
      react: flags.react,
      existing: flags.overwrite ? 'clear' : flags['keep-existing'] ? 'keep' : undefined,
      interactive: flags.interactive,
    };
    const result = await this.createProject(request);
    if (!result.created || result.answers === null) {
      process.exitCode = result.status;
      return;
    }
    process.exitCode = await this.connect(result, flags, server);
  }

  private async serverOf(typed: string | undefined): Promise<string | undefined> {
    if (typed === undefined) return undefined;
    const { ServerAddressError, serverOrigin } = await import('../remote/servers.js');
    try {
      return serverOrigin(typed);
    } catch (error) {
      if (error instanceof ServerAddressError) this.error(error.message, { exit: 2 });
      throw error;
    }
  }

  private async createProject(request: CreateRequest): Promise<CreateResult> {
    const { CreateUsageError, createProject, printResult } = await import('create-foliwake');
    const io = { cwd: process.cwd(), stdin: process.stdin, stdout: process.stdout, stderr: process.stderr };
    try {
      const result = await createProject(request, { ...io, env: process.env });
      printResult(result, io);
      return result;
    } catch (error) {
      if (error instanceof CreateUsageError) this.error(error.message, { exit: 2 });
      throw error;
    }
  }

  private async connect(
    result: CreateResult,
    flags: { 'create-site': boolean; 'link-site'?: string; relink: boolean; connect?: boolean; interactive?: boolean },
    server: string | undefined,
  ): Promise<number> {
    const { COMMAND } = await import('../settings.js');
    const answers = result.answers!;
    const interactive = flags.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);
    const out =
      (stream: NodeJS.WriteStream) =>
      (text = '') =>
        void stream.write(`${text}\n`);
    const io = { out: out(process.stdout), err: out(process.stderr) };
    const connected =
      flags.connect === false
        ? null
        : await (
            await import('../create-connect.js')
          ).connectStep(
            {
              target: answers.target,
              siteId: answers.siteId,
              committed: result.committed,
              interactive,
              createSite: flags['create-site'],
              linkSite: flags['link-site'],
              server,
              relink: flags.relink,
              prompts: { input: process.stdin, output: process.stdout },
              signIn: signInHere,
            },
            io,
          );
    if (connected === null) {
      io.out(
        `To publish it: sign in with \`${COMMAND} login\`, then run \`${COMMAND} site create <id>\` ` +
          `(or \`${COMMAND} site link <id>\` for an existing site) in the folder.`,
      );
    }
    return connected === null || connected === 0 ? result.status : connected;
  }
}

/** `foliwake login <origin>` inline: Ctrl+C stops only the wait (the project is created already). */
async function signInHere(origin: string): Promise<boolean> {
  const { deviceSignIn } = await import('../remote/sign-in.js');
  const controller = new AbortController();
  const onInterrupt = () => controller.abort();
  process.on('SIGINT', onInterrupt);
  try {
    const signed = await deviceSignIn(origin, {
      browser: true,
      tty: process.stdout.isTTY === true,
      insecureStorage: false,
      log: (text) => void process.stderr.write(text),
      signal: controller.signal,
    });
    const { serverDisplay } = await import('../remote/servers.js');
    process.stdout.write(`Signed in to ${serverDisplay(origin)} as ${signed.email ?? signed.grant.principal}.\n`);
    return true;
  } catch (error) {
    const { SignInCancelled } = await import('../remote/device-login.js');
    const cancelled = error instanceof SignInCancelled;
    const why = cancelled ? 'was cancelled' : `failed: ${(error as Error).message}`;
    process.stderr.write(`The sign-in to ${origin} ${why}.\n`);
    return false;
  } finally {
    process.off('SIGINT', onInterrupt);
  }
}
