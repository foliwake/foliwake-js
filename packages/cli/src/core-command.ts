// Base class of every command that maps to one core operation on a server. A command is a thin wrapper: it
// turns flags into the operation's input, calls it, writes text for people with `this.log` and returns the
// raw answer, which `--json` prints. Flags, texts and JSON are the engine CLI's own for the same command.
import { Command, Errors, Flags } from '@oclif/core';
import type { CoreCaller } from '@foliwake/core-contract';

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

const engineOnly = (name: string, description: string) =>
  Flags.string({ description: `${description} (${NEEDS_ENGINE.replace(/\.$/, '')})`, hidden: true, name });

export abstract class CoreCommand extends Command {
  static enableJsonFlag = true;

  static baseFlags = {
    debug: Flags.boolean({ description: 'print the underlying error on stderr', helpGroup: 'GLOBAL' }),
    server: Flags.string({
      description:
        "call this Foliwake server (origin or host; default: the folder's .foliwake/connection.json, " +
        'then $FOLIWAKE_SERVER, then the last `login`)',
      helpGroup: 'GLOBAL',
    }),
  };

  /** Accepted so that scripts written for the engine's CLI get a clear answer: a local configuration. */
  static configFlag = {
    config: engineOnly('config', 'a local project configuration'),
  };

  /** For commands that act on a site. Without `--site`: the folder's linked site, else the server's only one. */
  static siteFlags = {
    ...CoreCommand.configFlag,
    site: Flags.string({
      description: 'site id (default: the site this folder is linked to, else the only site on the server)',
    }),
  };

  /** Reading this computer's working files instead of the site's sources needs the engine. */
  static contentFlag = {
    content: engineOnly('content', "this folder instead of the site's content sources"),
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
      description:
        'report the total time on stderr (one JSON line with --json); also FOLIWAKE_TIMINGS=1 ' +
        '(phase timings need the engine)',
    }),
  };

  protected core!: CoreCaller;
  /** The server this command's calls go to. */
  protected target!: Target;
  private coreError: CoreError | null = null;

  async init(): Promise<void> {
    await super.init();
    // `parse()` without its command cannot type the flags of the subclass.
    const { flags } = await this.parse();
    for (const name of ['config', 'content']) {
      if (typeof flags[name] === 'string') this.error(`--${name} ${NEEDS_ENGINE}`, { exit: 2 });
    }
    this.target = await this.resolveServer(typeof flags.server === 'string' ? flags.server : undefined);
    const { SignInMovedError, remoteCallerFor } = await import('./remote/session.js');
    try {
      this.core = remoteCallerFor(this.target.origin);
    } catch (error) {
      if (error instanceof SignInMovedError) this.error(error.message, { exit: 1 });
      throw error;
    }
  }

  private async resolveServer(server: string | undefined): Promise<Target> {
    const { CLOUD_NOTE, CLOUD_ORIGIN, ServerAddressError, cloudConfigured, resolveTarget } = await import(
      './remote/servers.js'
    );
    try {
      const target = resolveTarget({ server });
      if (target === null) this.error(NO_SERVER, { exit: 2 });
      if (target.origin === CLOUD_ORIGIN && !cloudConfigured()) this.error(CLOUD_NOTE, { exit: 1 });
      return target;
    } catch (error) {
      if (error instanceof ServerAddressError) this.error(error.message, { exit: 2 });
      throw error;
    }
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

  /** The site: `--site`, else the folder's linked site on this server, else the server's only site. */
  protected async siteInput(site: string | undefined): Promise<{ site: string }> {
    if (site != null) return { site };
    const linked = await this.linkedSite();
    if (linked !== null) return { site: linked };
    const { sites } = await this.core.sites.list();
    if (sites.length !== 1) this.error(`${sites.length} sites are available on this server; choose one with --site.`);
    return { site: sites[0].id };
  }

  private async linkedSite(): Promise<string | null> {
    const { readConnection } = await import('./remote/connection.js');
    const { nameOrigin } = await import('./remote/servers.js');
    const connection = readConnection(process.cwd());
    if (!connection || nameOrigin(connection.server) !== this.target.origin) return null;
    return connection.site;
  }

  /** The settle delay that default waits start from; a server's own is not known here, so a fixed one. */
  protected async settleDelayMs(_siteId: string): Promise<number> {
    return REMOTE_SETTLE_DELAY_MS;
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
    return this.core.operations.get({ site, id });
  }

  /** `operations.wait` against a server, in slices under its request timeout. */
  private waitOperation(input: { site: string; id: string; until: 'commit' | 'delivery'; timeoutMs: number }) {
    return waitInSlices((sliceMs) => this.core.operations.wait({ ...input, timeoutMs: sliceMs }), input);
  }

  /** Runs `fn`; with `--timings` (or FOLIWAKE_TIMINGS=1) reports its total time on stderr. */
  protected async timed<T>(name: string, requested: boolean, fn: () => Promise<T>): Promise<T> {
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
    const failure = toCoreFailure(error);
    this.coreError = failure.coreError;
    if (process.argv.includes('--debug')) this.logToStderr(String(debugStack(failure)));
    return super.catch(new Errors.CLIError(this.errorText(failure.coreError), { exit: 1 }));
  }

  private errorText({ code, message, category, fields = [] }: CoreError): string {
    const details = fields.map((field) => (field.path ? `${field.path}: ${field.message}` : field.message));
    const origin = this.target?.origin;
    const signIn = origin && category === 'unauthorized' ? [`Sign in with \`${COMMAND} login ${origin}\`.`] : [];
    const older =
      code === 'PROCEDURE_UNKNOWN'
        ? [
            `The server is older than this CLI (@foliwake/cli ${cliVersion()}): update the server, or use ` +
              'an older @foliwake/cli that matches it (`GET /api/version` names its engine).',
          ]
        : [];
    return [`${code}: ${message}`, ...details, ...signIn, ...older, 'Run again with --debug for details.'].join('\n');
  }
}

function debugStack(failure: CoreFailure): string | undefined {
  return (failure.cause instanceof Error ? failure.cause : failure).stack;
}
