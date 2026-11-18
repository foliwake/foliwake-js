import { Command, Errors, Flags } from '@oclif/core';

import { NEEDS_ENGINE } from '../core-command.js';
import { devProblem, isRemote, withRemoteValue } from '../dev/flags.js';
import type { StopListeners } from '../dev/signal-stop.js';
import { UsageError } from '../dev/start.js';
import { type LocalRuntime, localRuntime } from '../local-runtime.js';

const WITHOUT_REMOTE = `\`dev\` without --remote serves local content and ${NEEDS_ENGINE}`;

/**
 * With the engine registered, the engine serves `dev`: its working files, and with --remote its own remote mode
 * (with the block catalog, which needs its renderer).
 */
const ENGINE = localRuntime() !== null;

/** A flag of local mode: with the engine, as it describes it; alone, hidden and refused with NEEDS_ENGINE. */
const localFlag = (description: string) =>
  ENGINE ? Flags.string({ description }) : Flags.string({ description, hidden: true });

interface EngineDevFlags {
  port?: number;
  watch?: boolean;
  'watch-polling'?: boolean;
  content?: string;
  config?: string;
  site?: string;
  remote?: string;
  'remote-url'?: string;
  'remote-config'?: string;
  'remote-auth-env'?: string;
  'remote-auth-user'?: string;
}

const ENGINE_EXAMPLES = [
  '<%= config.bin %> dev',
  '<%= config.bin %> dev --watch',
  '<%= config.bin %> dev --port 3001',
  '<%= config.bin %> dev --config foliwake.config.json --site a',
];

export default class Dev extends Command {
  static summary = ENGINE
    ? 'Serve working files with live diagnostics (http://127.0.0.1:3000)'
    : 'Develop blocks against a deployed site: its content, this checkout’s code (dev --remote)';

  static description = ENGINE
    ? "A server process, not a core operation: serves the working files (or the selected snapshot of the site's " +
      'source) with diagnostics, until Ctrl+C. With --remote: content from the deployed preview (default) or ' +
      'live site, code from this checkout.'
    : 'A server process, not a core operation: content from the deployed preview (default) or live site, ' +
      'components/, scripts/ and styles/ from this checkout, until Ctrl+C. Serving local content needs the engine.';

  static examples = [
    ...(ENGINE ? ENGINE_EXAMPLES : []),
    '<%= config.bin %> dev --remote --watch            # in the frontend checkout: preview content, local code',
    '<%= config.bin %> dev --remote live --port 3001',
    '<%= config.bin %> dev --remote-url https://preview.foliwake.example --remote-auth-user owner ' +
      '--remote-auth-env PREVIEW_PASSWORD',
  ];

  static flags = {
    config: localFlag('project configuration (default: $FOLIWAKE_CONFIG, else ./foliwake.config.json in this folder)'),
    site: localFlag('site id from the project configuration (required when it lists several sites)'),
    content: localFlag(
      "this folder instead of the site's content sources; refused when they need the page ledger",
    ),
    port: Flags.integer({ min: 0, max: 65535, description: 'port to listen on (default 3000)' }),
    watch: Flags.boolean({
      description:
        `watch local components/, scripts/, styles/${ENGINE ? ' and Markdown content' : ''} and reload open ` +
        'browser pages after changes ' +
        '(one reload per burst of saves; problems are shown in the page until fixed). Without it, refresh by hand',
    }),
    'watch-polling': Flags.boolean({
      allowNo: true,
      description:
        'with --watch: detect code changes by polling file stats (default on macOS); --no-watch-polling: ' +
        'native file-system events (default elsewhere). Precedence: this flag, then ' +
        'FOLIWAKE_WATCH_POLLING=1|0, then CHOKIDAR_USEPOLLING, then the platform default',
    }),
    remote: Flags.string({
      helpValue: '[preview|live]',
      description:
        'content from the deployed preview (default) or live site, local components/, scripts/ and styles/; ' +
        'endpoints from ./foliwake.remote.json. Live only when named; never a fallback',
    }),
    'remote-url': Flags.string({
      description: 'remote mode with this site origin instead of foliwake.remote.json (https; http only for loopback)',
    }),
    'remote-auth-env': Flags.string({
      helpValue: 'NAME',
      description:
        'with --remote-url: NAME of the environment variable holding the HTTP Basic password ' +
        '(never the password itself)',
    }),
    'remote-auth-user': Flags.string({ description: 'with --remote-auth-env: the HTTP Basic user name' }),
    'remote-config': Flags.string({
      description: 'with --remote: another endpoints file than ./foliwake.remote.json (same format, secret-free)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Dev, withRemoteValue(this.argv));
    const engine = localRuntime();
    if (!isRemote(flags) && !engine) this.error(WITHOUT_REMOTE, { exit: 2 });
    const problem = devProblem(flags);
    if (problem) throw new UsageError(problem);
    if (engine) {
      const code = await this.serveWithEngine(engine, flags);
      if (code !== 0) this.exit(code);
      return;
    }
    const { startRemoteDev } = await import('../dev/start.js');
    const options = {
      remote: flags.remote === 'live' ? ('live' as const) : ('preview' as const),
      port: flags.port,
      watch: flags.watch,
      polling: flags['watch-polling'],
      remoteUrl: flags['remote-url'],
      remoteConfig: flags['remote-config'],
      remoteAuthEnv: flags['remote-auth-env'],
      remoteAuthUser: flags['remote-auth-user'],
    };
    await startRemoteDev(
      options,
      (line) => this.log(line),
      (stop) => this.stopOnSignal(stop),
    );
  }

  /** The engine serves `dev`, local or remote. */
  private serveWithEngine(engine: LocalRuntime, flags: EngineDevFlags): Promise<number> {
    const remote = isRemote(flags)
      ? {
          target: flags.remote === 'live' ? ('live' as const) : ('preview' as const),
          url: flags['remote-url'],
          config: flags['remote-config'],
          authEnv: flags['remote-auth-env'],
          authUser: flags['remote-auth-user'],
        }
      : undefined;
    const options = {
      port: flags.port,
      watch: flags.watch,
      polling: flags['watch-polling'],
      content: flags.content,
      config: flags.config,
      site: flags.site,
      remote,
    };
    const io = { log: (line: string) => this.log(line), warn: (line: string) => this.logToStderr(line) };
    return engine.dev(options, io);
  }

  /** Set by stopOnSignal(): settles when a signal has stopped the server. */
  private stopped: Promise<void> | null = null;

  /** On Ctrl+C or SIGTERM: closes the listeners, waits for the work that runs, exits. */
  private stopOnSignal(stop: StopListeners): void {
    const warn = (line: string) => this.logToStderr(line);
    this.stopped = import('../dev/signal-stop.js').then(({ stopOnSignals }) =>
      stopOnSignals({ stop, exit: (code) => process.exit(code), warn }),
    );
  }

  // The command is done when a signal stopped the server, not when its listener started.
  protected async _run<T>(): Promise<T> {
    const result = await super._run<T>();
    if (this.stopped) await this.stopped;
    return result;
  }

  // Printed as they are: these messages name flags, paths and variables that a wrap would break.
  protected async catch(error: Error & { exitCode?: number }): Promise<unknown> {
    if (error instanceof Errors.CLIError || error instanceof Errors.ExitError) return super.catch(error);
    if (!(error instanceof UsageError)) return super.catch(error);
    this.logToStderr(error.message);
    return this.exit(2);
  }
}
