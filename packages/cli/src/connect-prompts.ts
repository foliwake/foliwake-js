// The questions `site create`, `site link` and `create` ask in a terminal (connect.ts):
// which signed-in server when there are several, which organisation when the account may create sites in
// several, and whether to replace the folder's link to
// another server or site. Without a terminal they are not asked: connect.ts refuses instead.
import type { Readable, Writable } from 'node:stream';

import type { ConnectRequest, ExistingLink, KnownServer } from './connect.js';
import type { CreatableOrg } from './connect-choices.js';

export interface TerminalStreams {
  input: Readable & { isTTY?: boolean };
  output: Writable & { isTTY?: boolean };
}

/** True when both streams are a terminal. */
export const isTerminal = (streams: TerminalStreams): boolean =>
  streams.input.isTTY === true && streams.output.isTTY === true;

/** `pick` and `confirmRelink` for a connect request in a terminal; nothing otherwise. */
export function terminalQuestions(
  streams: TerminalStreams,
  { ask }: { ask: boolean },
): Pick<ConnectRequest, 'pick' | 'confirmRelink' | 'pickOrg'> {
  if (!ask || !isTerminal(streams)) return {};
  const io = { input: streams.input, output: streams.output };
  return {
    pick: async (servers: KnownServer[]) => {
      const { askServer } = await import('./lib/prompts.js');
      return askServer(io, servers, (typed) => typed, { message: 'Which Foliwake server?', allowOther: false });
    },
    pickOrg: async (orgs: CreatableOrg[]) => {
      const { isCancel, select } = await import('@clack/prompts');
      const hint = (org: CreatableOrg) => (org.name === org.id ? undefined : org.name);
      const options = orgs.map((org) => ({ value: org.id, label: org.id, hint: hint(org) }));
      const answer = await select({ ...io, message: 'In which organisation?', options });
      return isCancel(answer) ? null : String(answer);
    },
    confirmRelink: async (from: ExistingLink, to: { server: string; site: string }) => {
      const { confirm, isCancel } = await import('@clack/prompts');
      const { describeLink } = await import('./connect.js');
      const answer = await confirm({
        ...io,
        message: `This folder is linked to ${describeLink(from)}. Replace that with site ${to.site} on ${to.server}?`,
        initialValue: false,
      });
      return !isCancel(answer) && answer === true;
    },
  };
}
