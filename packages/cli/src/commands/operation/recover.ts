import { Flags } from '@oclif/core';

import { CoreCommand, NEEDS_ENGINE } from '../../core-command.js';
import { localRuntime } from '../../local-runtime.js';
import { recoveryLines } from '../../render/recovery.js';

/**
 * Exit status of `operation recover --wait` when cache refreshes are still pending at its deadline (they stay
 * recorded).
 */
export const EXIT_REFRESH_PENDING = 3;

/** The lock is the engine's, and removing it is the operator's call on the host that runs it. */
const BREAK_LOCK_HERE = localRuntime()
  ? "needs the site's local configuration; it does not apply with a server."
  : NEEDS_ENGINE;

export default class OperationRecover extends CoreCommand {
  static description =
    'Find out what happened to interrupted operations, finish the engine’s interrupted work and pending cache ' +
    'refreshes; never runs an operation again (core operations.recover)';

  static examples = [
    '<%= config.bin %> operation recover --wait',
    '<%= config.bin %> operation recover --break-lock --wait   # only when the process named by STATE_LOCKED is gone',
  ];

  static flags = {
    ...CoreCommand.siteFlags,
    wait: Flags.boolean({
      description:
        'also wait (bounded) for pending cache refreshes; those still pending then stay recorded and the exit ' +
        'status is 3',
    }),
    'wait-timeout': Flags.integer({ min: 0, description: 'limit of --wait in seconds (default: settle delay + 90 s)' }),
    'break-lock': Flags.boolean({
      description: localRuntime()
        ? 'first remove a state lock left by a process that is gone (for example on another host name)'
        : 'remove a state lock left by a process that is gone (on the server: needs the engine there)',
    }),
    ...CoreCommand.timingsFlag,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(OperationRecover);
    if (flags['break-lock'] && !this.local) this.error(`--break-lock ${BREAK_LOCK_HERE}`, { exit: 2 });
    const input = await this.resolveInput(flags.input, async () => {
      const { site } = await this.siteInput(flags.site);
      if (!flags.wait) return { site, waitMs: null };
      return {
        site,
        waitMs:
          flags['wait-timeout'] === undefined
            ? (await this.settleDelayMs(site)) + 90_000
            : flags['wait-timeout'] * 1000,
      };
    });
    if (flags['break-lock'] && this.local) this.log(await this.local.breakLock(input.site));
    const answer = await this.timed('recover', flags.timings, () => this.core.operations.recover(input));
    if (!this.jsonEnabled()) for (const line of recoveryLines(answer)) this.log(line);
    if (input.waitMs !== null && answer.engine.cacheRefresh.state === 'pending')
      process.exitCode = EXIT_REFRESH_PENDING;
    return answer;
  }
}
