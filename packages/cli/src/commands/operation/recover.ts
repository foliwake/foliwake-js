import { Flags } from '@oclif/core';

import { CoreCommand, NEEDS_ENGINE } from '../../core-command.js';
import { recoveryLines } from '../../render/recovery.js';

/**
 * Exit status of `operation recover --wait` when cache refreshes are still pending at its deadline (they stay
 * recorded).
 */
export const EXIT_REFRESH_PENDING = 3;

export default class OperationRecover extends CoreCommand {
  static description =
    'Find out what happened to interrupted operations, finish the engine’s interrupted work and pending cache ' +
    'refreshes; never runs an operation again (core operations.recover)';

  static examples = ['<%= config.bin %> operation recover --wait'];

  static flags = {
    ...CoreCommand.siteFlags,
    wait: Flags.boolean({
      description:
        'also wait (bounded) for pending cache refreshes; those still pending then stay recorded and the exit ' +
        'status is 3',
    }),
    'wait-timeout': Flags.integer({ min: 0, description: 'limit of --wait in seconds (default: settle delay + 90 s)' }),
    'break-lock': Flags.boolean({
      description: 'remove a state lock left by a process that is gone (on the server: needs the engine there)',
    }),
    ...CoreCommand.timingsFlag,
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(OperationRecover);
    if (flags['break-lock']) this.error(`--break-lock ${NEEDS_ENGINE}`, { exit: 2 });
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
    const answer = await this.timed('recover', flags.timings, () => this.core.operations.recover(input));
    if (!this.jsonEnabled()) for (const line of recoveryLines(answer)) this.log(line);
    if (input.waitMs !== null && answer.engine.cacheRefresh.state === 'pending')
      process.exitCode = EXIT_REFRESH_PENDING;
    return answer;
  }
}
