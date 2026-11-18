// Base class of every command that maps to one core operation on a server. A command is a thin wrapper: it
// turns flags into the operation's input, calls it, writes text for people with `this.log` and returns the
// raw answer, which `--json` prints. Flags, texts and JSON are the engine CLI's own for the same command.
// With the engine's runtime registered (local-runtime.ts) the same command also runs on this computer.
import { Command, Errors, Flags } from '@oclif/core';
import type { CoreCaller } from '@foliwake/core-contract';

import { type LocalCore, localRuntime } from './local-runtime.js';
import { type CoreError, CoreFailure, toCoreFailure } from './remote/core-failure.js';
import type { Target } from './remote/servers.js';
import { type Operation, waitInSlices } from './remote/wait-slices.js';
import { COMMAND } from './settings.js';
import { cliVersion } from './version.js';

/** Commit or end: a long sync or publication finishes long before; the wait stops nothing. */
const COMMIT_WAIT_MS = 24 * 60 * 60 * 1000;
/** Default waits start from this settle delay (the server's own is not known here). */
const REMOTE_SETTLE_DELAY_MS = 30_000;

/** What a command that needs the engine says, with exit 2. */
export const NEEDS_ENGINE =
  `needs the Foliwake engine: the Docker image (\`${COMMAND} docker install\`) or the ` + `engine checkout.`;

const NO_SERVER =
  `No Foliwake server is named: pass --server, link this folder (\`${COMMAND} site link <id>\`), ` +
  `set FOLIWAKE_SERVER, or sign in with \`${COMMAND} login\`.`;

/** Registered before oclif loads the commands, so flags read it when this module loads. */
const ENGINE = localRuntime() !== null;

/** With the engine: a flag of local mode. Alone: accepted, hidden, and answered with NEEDS_ENGINE. */
const localFlag = (name: string, description: string, alone: string) =>
  ENGINE
    ? Flags.string({ description, name })
    : Flags.string({ description: `${alone} (${NEEDS_ENGINE.replace(/\.$/, '')})`, hidden: true, name });

const SERVER_DEFAULT = "default: the folder's .foliwake/connection.json, then $FOLIWAKE_SERVER, then the last `login`";

const SERVER_FLAG = ENGINE
  ? `call this Foliwake server (origin or host) instead of the local configuration (${SERVER_DEFAULT})`
  : `call this Foliwake server (origin or host; ${SERVER_DEFAULT})`;

const SITE_FLAG = ENGINE
  ? 'site id (default: the site this folder is linked to, else the only site of the configuration or server)'
  : 'site id (default: the site this folder is linked to, else the only site on the server)';

/** The entry name of a command's trace: its words joined by dots (`code:deploy` → `code.deploy`). */
const commandSpanName = (id: string | undefined): string => (id ?? 'command').replaceAll(':', '.');

export abstract class CoreCommand extends Command {
  static enableJsonFlag = true;

  static baseFlags = {
    debug: Flags.boolean({ description: 'print the underlying error on stderr', helpGroup: 'GLOBAL' }),
    server: Flags.string({ description: SERVER_FLAG, helpGroup: 'GLOBAL' }),
  };

  /** A local project configuration: the engine's; alone, scripts written for the engine get a clear answer. */
  static configFlag = {
    config: localFlag(
      'config',
      'project configuration (default: $FOLIWAKE_CONFIG, else ./foliwake.config.json in this folder)',
      'a local project configuration',
    ),
  };

  /** For commands that act on a site. Without `--site`: the folder's linked site, else the server's only one. */
  static siteFlags = {
    ...CoreCommand.configFlag,
    site: Flags.string({ description: SITE_FLAG }),
  };

  /** Reading this computer's working files instead of the site's sources: the engine's local runtime. */
  static contentFlag = {
    content: localFlag(
      'content',
      "this folder instead of the site's content sources; refused when they need the page ledger",
      "this folder instead of the site's content sources",
    ),
  };

  /** The whole input of the operation as JSON, for what flags cannot express. Its schema checks it. */
  static inputFlag = {
    input: Flags.string({ description: 'raw JSON for the full operation input; overrides the other input flags' }),
  };

  static refreshWaitFlag = {
    'wait-timeout': Flags.integer({
      min: 0,
      description:
        "limit of the wait for this write's cache refresh, in seconds (default: settle delay + 30 s); " +
        'still pending then: exit 3, `operation recover` finishes it',
    }),
  };

  static expectLiveFlags = {
    expect: Flags.string({
      description: 'the live site release you saw (sr_…, as `site status` shows it); refused when live is another one',
      exclusive: ['latest-live'],
    }),
    'latest-live': Flags.boolean({
      description: 'expect the live release as it is now (read once, before the request)',
      exclusive: ['expect'],
    }),
  };

  static expectBranchFlags = {
    expect: Flags.string({
      helpValue: 'sel_…|none',
      description:
        'the selection of the branch you saw (`branch list --json` shows it; `none`: the branch had no preview); ' +
        'refused when it is another one',
      exclusive: ['latest-selection', 'sequence'],
    }),
    'latest-selection': Flags.boolean({
      description: "expect the branch's selection as it is now (read once, before the request)",
      exclusive: ['expect', 'sequence'],
    }),
    sequence: Flags.integer({
      min: 1,
      description:
        'deployment ordering (a positive integer such as the CI run id), instead of --expect: refused as ' +
        'superseded when a request with a higher sequence already updated or deleted this branch',
      exclusive: ['expect', 'latest-selection'],
    }),
  };

  /** Accepted as in the engine's CLI; only the total time is known here (phase timings need the engine). */
  static timingsFlag = {
    timings: Flags.boolean({
      description: ENGINE
        ? 'report phase timings, request counts and transferred bytes on stderr (one JSON line with --json); ' +
          'also FOLIWAKE_TIMINGS=1 or FOLIWAKE_TIMINGS_FILE=<file>'
        : 'report the total time on stderr (one JSON line with --json); also FOLIWAKE_TIMINGS=1 ' +
          '(phase timings need the engine)',
    }),
  };

  protected core!: CoreCaller;
  /** The server this command's calls go to; unset when it runs locally (`local`). */
  protected target!: Target;
  /** The engine's core on this computer, when the command runs locally. */
  protected local: LocalCore | null = null;
  private coreError: CoreError | null = null;

  // With the engine, each command is the entry of its trace when traces are exported.
  protected async _run<T>(): Promise<T> {
    const engine = localRuntime();
    if (!engine) return super._run<T>();
    return engine.traced(commandSpanName(this.id), () => super._run<T>());
  }

  async init(): Promise<void> {
    await super.init();
    // `parse()` without its command cannot type the flags of the subclass.
    const { flags } = await this.parse();
    const text = (name: string) => (typeof flags[name] === 'string' ? (flags[name] as string) : undefined);
    const engine = localRuntime();
    if (!engine) {
      for (const name of ['config', 'content']) if (text(name)) this.error(`--${name} ${NEEDS_ENGINE}`, { exit: 2 });
    }
    const { chooseTarget } = await import('./local-target.js');
    const choice = await this.guarded(() => chooseTarget({ server: text('server'), config: text('config') }));
    if (choice === 'local' && engine) {
      const content = text('content');
      const { default: path } = await import('node:path');
      const contentFolder = content === undefined ? undefined : path.resolve(process.cwd(), content);
      this.local = engine.open({ config: text('config'), content: contentFolder, debug: flags.debug === true });
      this.core = this.local.core;
      return;
    }
    if (text('content') !== undefined) {
      this.error('--content reads a folder on this computer; it does not apply to a server.', { exit: 2 });
    }
    this.target = await this.serverTarget(choice === 'local' ? null : choice);
    const { SignInMovedError, remoteCallerFor } = await import('./remote/session.js');
    try {
      this.core = remoteCallerFor(this.target.origin);
    } catch (error) {
      if (error instanceof SignInMovedError) this.error(error.message, { exit: 1 });
      throw error;
    }
  }

  /** Runs `choose`; a server address or flag combination it refuses exits 2 with its message. */
  private async guarded<T>(choose: () => T): Promise<T> {
    const { ServerAddressError } = await import('./remote/servers.js');
    try {
      return choose();
    } catch (error) {
      if (error instanceof ServerAddressError) this.error(error.message, { exit: 2 });
      throw error;
    }
  }

  private async serverTarget(target: Target | null): Promise<Target> {
    const { CLOUD_NOTE, CLOUD_ORIGIN, cloudConfigured } = await import('./remote/servers.js');
    if (target === null) this.error(NO_SERVER, { exit: 2 });
    if (target.origin === CLOUD_ORIGIN && !cloudConfigured()) this.error(CLOUD_NOTE, { exit: 1 });
    return target;
  }

  protected async resolveInput<TInput>(rawInput: string | undefined, fromFlags: () => TInput | Promise<TInput>) {
    if (rawInput == null) return fromFlags();
    try {
      // The untyped boundary: the operation's own schema checks what the JSON holds.
      return JSON.parse(rawInput) as TInput;
    } catch {
      this.error('--input is not valid JSON.');
    }
  }

  /** The site: `--site`, else the folder's linked site on this server, else the server's (or configuration's) only. */
  protected async siteInput(site: string | undefined): Promise<{ site: string }> {
    if (site != null) return { site };
    if (this.local) return this.onlyLocalSite(this.local);
    const linked = await this.linkedSite();
    if (linked !== null) return { site: linked };
    const { sites } = await this.core.sites.list();
    if (sites.length !== 1) this.error(`${sites.length} sites are available on this server; choose one with --site.`);
    return { site: sites[0].id };
  }

  private async onlyLocalSite(local: LocalCore): Promise<{ site: string }> {
    const sites = await local.sites();
    if (sites.length !== 1) this.error(`${sites.length} sites are configured; choose one with --site.`);
    return { site: sites[0].id };
  }

  private async linkedSite(): Promise<string | null> {
    const { readConnection } = await import('./remote/connection.js');
    const { nameOrigin } = await import('./remote/servers.js');
    const connection = readConnection(process.cwd());
    if (!connection || nameOrigin(connection.server) !== this.target.origin) return null;
    return connection.site;
  }

  /** The settle delay that default waits start from: the site's locally; a server's is not known, so a fixed one. */
  protected async settleDelayMs(siteId: string): Promise<number> {
    return this.local ? this.local.settleDelayMs(siteId) : REMOTE_SETTLE_DELAY_MS;
  }

  /** The `expect.live` of a write: `--expect`, or with `--latest-live` the live release read now. */
  protected async expectedLive(
    site: string,
    flags: { expect?: string | undefined; 'latest-live'?: boolean | undefined },
  ): Promise<string> {
    if (flags.expect !== undefined) return flags.expect;
    if (!flags['latest-live']) {
      this.error('Name the live release you expect: --expect <sr_…> (as `site status` shows it), or --latest-live.', {
        exit: 2,
      });
    }
    const { live } = await this.core.sites.status({ site });
    if (!live) this.error('This site has no live release yet.');
    return live.site_release;
  }

  /** The `expect` of a branch write: `--sequence`, `--expect`, or with `--latest-selection` the selection now. */
  protected async expectedBranch(
    site: string,
    branch: string,
    flags: { expect?: string | undefined; 'latest-selection'?: boolean | undefined; sequence?: number | undefined },
  ): Promise<{ sequence: number } | { selection: string | null }> {
    if (flags.sequence !== undefined) return { sequence: flags.sequence };
    if (flags.expect !== undefined) return { selection: flags.expect === 'none' ? null : flags.expect };
    if (!flags['latest-selection']) {
      this.error(
        'Name the branch selection you expect: --expect <sel_…|none> (as `branch list --json` shows it), ' +
          '--latest-selection, or --sequence <n> for a deployment.',
        { exit: 2 },
      );
    }
    const rows = await this.core.branches.list({ site });
    const row = rows.find((candidate) => candidate.branch === branch);
    return { selection: row && row.retired === null ? row.selection : null };
  }

  /** Follows an accepted operation to its commit (or end) and, with `--wait`, its cache refresh. */
  protected async follow(
    operation: Operation,
    { wait, waitTimeout }: { wait: boolean; waitTimeout: number | undefined },
  ): Promise<Operation> {
    const { site, id } = operation;
    const committed = await this.waitOperation({ site, id, until: 'commit', timeoutMs: COMMIT_WAIT_MS });
    if (!wait || committed.delivery?.state !== 'pending') return committed;
    const timeoutMs = waitTimeout === undefined ? (await this.settleDelayMs(site)) + 30_000 : waitTimeout * 1000;
    const seconds = Math.ceil(timeoutMs / 1000);
    if (!this.jsonEnabled()) this.log(`Cache refresh pending; waiting up to ${seconds} s for it…`);
    const delivered = await this.waitOperation({ site, id, until: 'delivery', timeoutMs });
    if (delivered.delivery?.state !== 'pending' || delivered.delivery.reason !== undefined) return delivered;
    // The time is up: locally, stop waiting here, so the row says why it is still pending.
    await this.local?.close();
    return this.core.operations.get({ site, id });
  }

  /** `operations.wait`: locally in one call; against a server in slices under its request timeout. */
  private waitOperation(input: { site: string; id: string; until: 'commit' | 'delivery'; timeoutMs: number }) {
    if (this.local) return this.core.operations.wait(input);
    return waitInSlices((sliceMs) => this.core.operations.wait({ ...input, timeoutMs: sliceMs }), input);
  }

  /** Runs `fn`; with `--timings` (or FOLIWAKE_TIMINGS=1) reports its time on stderr (phases: the engine's). */
  protected async timed<T>(name: string, requested: boolean, fn: () => Promise<T>): Promise<T> {
    const engine = localRuntime();
    if (engine) return engine.timed(name, { requested, json: this.jsonEnabled() }, fn);
    if (!requested && process.env.FOLIWAKE_TIMINGS !== '1') return fn();
    const started = performance.now();
    try {
      return await fn();
    } finally {
      this.reportTotal(name, Math.round(performance.now() - started));
    }
  }

  private reportTotal(name: string, totalMs: number): void {
    const line = this.jsonEnabled()
      ? JSON.stringify({ timings: { command: name, totalMs } })
      : `timings: ${name} ${totalMs} ms in total (phase timings need the engine)`;
    process.stderr.write(`${line}\n`);
  }

  // Locally: takes no new work and waits for what runs; a cache refresh still waiting is left to `operation recover`.
  async finally(error: Error | undefined): Promise<unknown> {
    await this.local?.close();
    return super.finally(error);
  }

  protected noteProvisional(provisional: boolean): void {
    if (!provisional || this.jsonEnabled()) return;
    this.logToStderr(
      'Note: page IDs of new pages are provisional here (the published pages were not consulted); ' +
        'preview/publish decide them.',
    );
  }

  protected toErrorJson(error: unknown): unknown {
    return { error: this.coreError ?? { message: error instanceof Error ? error.message : String(error) } };
  }

  // Anything that is not oclif's own goes through core's error shape and exits 1. Parse errors keep exit 2.
  protected async catch(error: Error & { exitCode?: number }): Promise<unknown> {
    if (error instanceof Errors.CLIError) return super.catch(error);
    const failure = await failureOf(error);
    this.coreError = failure.coreError;
    if (process.argv.includes('--debug')) this.logToStderr(String(debugStack(failure)));
    return super.catch(new Errors.CLIError(this.errorText(failure.coreError), { exit: 1 }));
  }

  private errorText({ code, message, category, fields = [] }: CoreError): string {
    const details = fields.map((field) => (field.path ? `${field.path}: ${field.message}` : field.message));
    const origin = this.local ? undefined : this.target?.origin;
    const signIn = origin && category === 'unauthorized' ? [`Sign in with \`${COMMAND} login ${origin}\`.`] : [];
    const older =
      code === 'PROCEDURE_UNKNOWN' && origin
        ? [
            `The server is older than this CLI (@foliwake/cli ${cliVersion()}): update the server, or use ` +
              'an older @foliwake/cli that matches it (`GET /api/version` names its engine).',
          ]
        : [];
    return [`${code}: ${message}`, ...details, ...signIn, ...older, 'Run again with --debug for details.'].join('\n');
  }
}

/** What a command threw, as a CoreFailure: the engine maps its own failures; a server's arrive as they are. */
async function failureOf(error: unknown): Promise<CoreFailure> {
  const engine = localRuntime();
  if (error instanceof CoreFailure || !engine) return toCoreFailure(error);
  const { coreError, cause } = await engine.failure(error);
  return new CoreFailure(coreError, cause);
}

function debugStack(failure: CoreFailure): string | undefined {
  return (failure.cause instanceof Error ? failure.cause : failure).stack;
}
