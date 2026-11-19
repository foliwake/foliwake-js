// The flags of `npx @foliwake/next init`, each with an environment equivalent (FOLIWAKE_INIT_*) for CI.
import { parseArgs } from 'node:util';

/** What the person asked for. */
export interface InitOptions {
  command: 'init' | 'help';
  url: string | null;
  yes: boolean;
  preview: boolean;
  hook: boolean;
  mount: string | null;
  dryRun: boolean;
  json: boolean;
  check: boolean;
  force: boolean;
  cwd: string;
  ignoreGitChanges: boolean;
}

/** Bad flags: exit 1 with the message. */
export class UsageError extends Error {
  override name = 'UsageError';
}

export const USAGE = `Usage: npx @foliwake/next init [options]

Sets up Foliwake pages in this Next.js app: FOLIWAKE_URL in .env.local, withFoliwake() in next.config,
app/foliwake/[...path]/route.ts (code, media, hook) and app/[...path]/page.tsx (site pages).

  --url <https://site>     the site's live URL (FOLIWAKE_INIT_URL)
  --preview                add a preview route behind a dev-only isAuthor() (FOLIWAKE_INIT_PREVIEW=1)
  --hook                   add FOLIWAKE_HOOK_SECRET= to .env.local (FOLIWAKE_INIT_HOOK=1)
  --mount </pages>         serve pages under this path instead of the root (FOLIWAKE_INIT_MOUNT)
  --yes                    ask nothing (CI=1 too); needs --url
  --dry-run                show the plan, write nothing
  --json                   print the result as JSON
  --check                  check an existing setup instead of writing
  --force                  overwrite files that init generated before
  --ignore-git-changes     run on a working tree with uncommitted changes
  --cwd <dir>              the app's folder (default: the current one)

Exit codes: 0 done, 1 error, 2 input needed (no --url with --yes or without a terminal).`;

const FLAGS = {
  url: { type: 'string' },
  yes: { type: 'boolean' },
  preview: { type: 'boolean' },
  hook: { type: 'boolean' },
  mount: { type: 'string' },
  'dry-run': { type: 'boolean' },
  json: { type: 'boolean' },
  check: { type: 'boolean' },
  force: { type: 'boolean' },
  cwd: { type: 'string' },
  'ignore-git-changes': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

const truthy = (value: string | undefined): boolean => value !== undefined && /^(1|true|yes)$/i.test(value);

function commandOf(positionals: string[], help: boolean | undefined): InitOptions['command'] {
  if (help || positionals.length === 0 || positionals[0] === 'help') return 'help';
  if (positionals[0] !== 'init' || positionals.length > 1) {
    throw new UsageError(`Unknown command "${positionals.join(' ')}". ${USAGE.split('\n')[0]}`);
  }
  return 'init';
}

function parsedArgs(argv: string[]) {
  try {
    return parseArgs({ args: argv, options: FLAGS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

/** The options of `argv` (without node and the script) and `env`. Throws UsageError. */
export function parseOptions(argv: string[], env: NodeJS.ProcessEnv, cwd: string): InitOptions {
  const { values, positionals } = parsedArgs(argv);
  return {
    command: commandOf(positionals, values.help),
    url: values.url ?? env.FOLIWAKE_INIT_URL ?? null,
    yes: values.yes ?? (truthy(env.FOLIWAKE_INIT_YES) || truthy(env.CI)),
    preview: values.preview ?? truthy(env.FOLIWAKE_INIT_PREVIEW),
    hook: values.hook ?? truthy(env.FOLIWAKE_INIT_HOOK),
    mount: values.mount ?? env.FOLIWAKE_INIT_MOUNT ?? null,
    dryRun: values['dry-run'] ?? false,
    json: values.json ?? false,
    check: values.check ?? false,
    force: values.force ?? false,
    cwd: values.cwd ?? cwd,
    ignoreGitChanges: values['ignore-git-changes'] ?? false,
  };
}
