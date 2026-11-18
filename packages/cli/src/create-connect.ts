// The last step of `foliwake create`: «Connect to a Foliwake server?». In a terminal: which server (each
// signed in to, those signed out of, another one, or not now; not asked with --server or FOLIWAKE_SERVER), the
// sign-in when it is needed (as `login`), then a new site (offered to admins), an existing one, or not now.
// Without a terminal: only --create-site or --link-site, on the server `site create` would choose. Runs the
// same code as `site create` and `site link` in the new folder.
import { localSiteId } from 'create-foliwake';

import { connectChoices, createSite, knownServers, linkSite, type ConnectIO } from './connect.js';
import { terminalQuestions } from './connect-prompts.js';
import { type PromptStreams, askConnect, askServer } from './lib/prompts.js';
import { cloudConfigured, serverOrigin } from './remote/servers.js';
import { COMMAND, setting } from './settings.js';

export interface ConnectStep {
  /** The project folder, as created. */
  target: string;
  /** The site id the answers named, if any. */
  siteId: string | null;
  /** The project has its first commit (a new site gets its code from it). */
  committed: boolean;
  interactive: boolean;
  createSite: boolean;
  linkSite: string | undefined;
  /** An origin, from --server. */
  server: string | undefined;
  relink: boolean;
  prompts: PromptStreams;
  signIn: (origin: string) => Promise<boolean>;
  /** Told the server and site the folder was linked to (`connect --json`). */
  onLinked?: (linked: { server: string | null; site: string; created: boolean }) => void;
}

type Run = (server: string | null) => Promise<number>;

function relinkOf(step: ConnectStep) {
  const ask = terminalQuestions({ input: process.stdin, output: process.stdout }, { ask: step.interactive });
  return { relink: step.relink, confirmRelink: ask.confirmRelink };
}

function runner(step: ConnectStep, io: ConnectIO, site: string): Run {
  const base = { cwd: step.target, env: process.env, ...relinkOf(step) };
  return async (server) => {
    const on = server ?? undefined;
    if (step.linkSite) {
      const linked = await linkSite({ ...base, site: step.linkSite, server: on }, io);
      if (linked.exit === 0) step.onLinked?.({ server: linked.server, site: step.linkSite, created: false });
      return linked.exit;
    }
    const created = await createSite({ ...base, site, server: on, code: true }, io);
    if (created.exit === 0) step.onLinked?.({ server: created.server, site, created: true });
    return created.exit;
  };
}

/** FOLIWAKE_SERVER as an origin, or null (a value that is no address is said and not used). */
function presetServer(): string | null {
  const typed = setting('SERVER', process.env);
  if (!typed) return null;
  try {
    return serverOrigin(typed);
  } catch (error) {
    process.stderr.write(`FOLIWAKE_SERVER is not used: ${(error as Error).message}\n`);
    return null;
  }
}

async function choicesOn(server: string, io: ConnectIO): Promise<{ mayCreate: boolean; sites: string[] } | null> {
  try {
    const { mayCreate, sites } = await connectChoices({ server, env: process.env }, io);
    return { mayCreate, sites };
  } catch (error) {
    const code = (error as { coreError?: { code: string } }).coreError?.code ?? (error as Error).message;
    const later = `connect later with \`${COMMAND} site create\` or \`site link\``;
    process.stderr.write(`${server} could not list your sites (${code}); ${later}.\n`);
    return null;
  }
}

/** The connect step; its exit status, or null when nothing ran (not now, a failed sign-in, no answer). */
export async function connectStep(step: ConnectStep, io: ConnectIO): Promise<number | null> {
  const site = localSiteId(step.siteId, step.target);
  const run = runner(step, io, site);
  const asked = step.createSite || step.linkSite !== undefined;
  if (!step.interactive) return asked ? run(step.server ?? null) : null;
  const known = await knownServers(process.env, { withCloud: cloudConfigured() });
  const server =
    step.server ?? presetServer() ?? (await askServer(step.prompts, known, (typed) => serverOrigin(typed)));
  if (server === null) return null;
  if (!known.some((entry) => entry.origin === server && entry.signedIn)) {
    io.out(`\nSigning in to ${server} (as \`${COMMAND} login ${server}\`).`);
    if (!(await step.signIn(server))) return null;
  }
  if (asked) return run(server);
  if (!step.committed) {
    io.out(`There is no first commit: a new site gets no code until \`${COMMAND} code prepare\` on the server.`);
  }
  const choices = await choicesOn(server, io);
  if (!choices) return null;
  const answer = await askConnect(step.prompts, { server, site, ...choices });
  if (!answer) return null;
  io.out('');
  return 'create' in answer ? run(server) : linkWith(step, io, answer.link, server);
}

async function linkWith(step: ConnectStep, io: ConnectIO, site: string, server: string): Promise<number> {
  const request = { cwd: step.target, env: process.env, site, server, ...relinkOf(step) };
  const linked = await linkSite(request, io);
  if (linked.exit === 0) step.onLinked?.({ server: linked.server, site, created: false });
  return linked.exit;
}
