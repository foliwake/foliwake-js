import { Flags } from '@oclif/core';

import { COMMAND } from '../../settings.js';
import { CoreCommand } from '../../core-command.js';
import { traceLines } from '../../render/operation.js';

const C = COMMAND;

export default class CodeDeploy extends CoreCommand {
  static description =
    "Deploy a commit of the site's frontend: prepare it, rebuild every page against it in preview and, with " +
    'codeRelease auto, release exactly that pair when its checks pass (core code.deploy). Its progress goes to ' +
    'stderr while it runs (one JSON event per line with --json); `operation list` shows it too';

  static examples = ['<%= config.bin %> code deploy --rev <40-hex sha> --sequence <ci run id> --json'];

  static flags = {
    ...CoreCommand.siteFlags,
    rev: Flags.string({ description: 'the full commit SHA to deploy' }),
    sequence: Flags.integer({
      description: 'deployment ordering, e.g. a CI run id; an older one than live code is not released',
      min: 1,
    }),
    ...CoreCommand.inputFlag,
  };

  async run(): Promise<unknown> {
    const { flags } = await this.parse(CodeDeploy);
    const input = await this.resolveInput(flags.input, async () => {
      if (flags.rev === undefined) this.error('Name the commit with --rev <40-hex sha>.', { exit: 2 });
      return {
        ...(await this.siteInput(flags.site)),
        rev: flags.rev,
        ...(flags.sequence === undefined ? {} : { sequence: flags.sequence }),
      };
    });
    const answer = await this.core.code.deploy(input);
    if (answer.result === 'released')
      this.log(
        `Released ${answer.codeRelease} with every page (${answer.siteRelease}). To go back: \`${C} release ` +
          `rollback ${answer.previousSiteRelease} --expect ${answer.siteRelease}\`.`,
      );
    else if (answer.result === 'prepared')
      this.log(
        `Prepared ${answer.codeRelease}; every page rebuilt in preview (${answer.previewRelease}). Live is ` +
          `unchanged.${answer.reason ? ` ${answer.reason}` : ''} Release by hand: \`${C} migration commit --expect ` +
          `${answer.expect}\`.`,
      );
    else this.log(`Failed${answer.code ? ` (${answer.code})` : ''}: ${answer.reason ?? 'no reason'}`);
    for (const gate of answer.gates) this.log(`  ${gate.ok ? 'ok  ' : 'FAIL'} ${gate.gate}: ${gate.detail}`);
    for (const item of answer.rebuild?.diagnostics ?? [])
      this.log(`  ${item.severity} ${item.code} ${item.file}:${item.line}:${item.column} ${item.message}`);
    const t = answer.timings;
    if (t) {
      const steps = Object.entries(t.steps)
        .map(
          ([step, ms]) =>
            `${step} ${(ms / 1000).toFixed(1)} s${t.stepStore?.[step] ? `/${t.stepStore[step].requests} req` : ''}`,
        )
        .join(', ');
      this.log(
        `  took ${(t.totalMs / 1000).toFixed(1)} s (${steps}); ${t.pagesBuilt} pages built; ${t.store.requests} ` +
          `store requests (${t.store.notModified} checked without bytes), ` +
          `${(t.store.bytesDown / 1048576).toFixed(1)} MiB down, ${(t.store.bytesUp / 1048576).toFixed(1)} MiB up`,
      );
    }
    if (answer.operation) this.log(`  operation ${answer.operation} (\`${C} operation get ${answer.operation}\`)`);
    if (answer.release?.delivery?.state === 'pending')
      this.log(`Cache refresh still pending; \`${C} operation recover --wait\` finishes it.`);
    // 0: released and delivered, or prepared for a manual release; 3: released, refresh pending; 1: failed or held by a
    // check.
    const held = answer.result === 'prepared' && answer.mode === 'auto';
    if ((answer.result === 'failed' || held) && answer.operation) {
      for (const line of await this.traceOf(input.site, answer.operation)) {
        this.log(line);
      }
    }
    process.exitCode = answer.result === 'failed' || held ? 1 : answer.release?.delivery?.state === 'pending' ? 3 : 0;
    return answer;
  }

  /** Where to look after a failed deploy: the trace its operation recorded (when traces were exported). */
  private async traceOf(site: string, id: string): Promise<string[]> {
    try {
      return traceLines((await this.core.operations.get({ site, id })).trace);
    } catch {
      return []; // the answer and its exit status do not depend on this read
    }
  }
}
