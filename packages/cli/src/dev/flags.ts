// What `foliwake dev` checks of its command line; no server imports, so `--help` stays light.

/** The flags of `foliwake dev` as given (`remote`: 'preview' | 'live' or anything else the user typed). */
export interface DevFlags {
  remote?: string | undefined;
  'remote-url'?: string | undefined;
  'remote-config'?: string | undefined;
  'remote-auth-env'?: string | undefined;
  'remote-auth-user'?: string | undefined;
  watch?: boolean | undefined;
  'watch-polling'?: boolean | undefined;
}

export const isRemote = (flags: DevFlags): boolean => flags.remote !== undefined || flags['remote-url'] !== undefined;

function localOnlyProblem(flags: DevFlags): string | null {
  if (flags['remote-auth-env'] !== undefined) return '--remote-auth-env applies with --remote-url.';
  if (flags['remote-auth-user'] !== undefined) return '--remote-auth-user applies with --remote-url.';
  if (flags['remote-config'] !== undefined) return '--remote-config applies with --remote.';
  return null;
}

function authProblem(flags: DevFlags): string | null {
  const env = flags['remote-auth-env'] !== undefined;
  const user = flags['remote-auth-user'] !== undefined;
  if ((env || user) && flags['remote-url'] === undefined) {
    return (
      '--remote-auth-env and --remote-auth-user apply with --remote-url; ' +
      'with foliwake.remote.json the file names the variable.'
    );
  }
  if (env !== user) return '--remote-auth-env and --remote-auth-user must be given together.';
  return null;
}

/** What the command line of `dev` may not combine; the message, or null. */
export function devProblem(flags: DevFlags): string | null {
  const polling = flags['watch-polling'];
  if (polling !== undefined && !flags.watch) {
    return `--${polling ? 'watch-polling' : 'no-watch-polling'} applies with --watch.`;
  }
  if (!isRemote(flags)) return localOnlyProblem(flags);
  if (flags.remote !== undefined && flags.remote !== 'preview' && flags.remote !== 'live') {
    return `Unknown remote target "${flags.remote}"; use --remote preview (the default) or --remote live.`;
  }
  if (flags['remote-config'] !== undefined && flags['remote-url'] !== undefined) {
    return 'Use either --remote-config or --remote-url, not both.';
  }
  return authProblem(flags);
}

/** `--remote` takes an optional value: alone (or before another option) it means preview. */
export function withRemoteValue(argv: readonly string[]): string[] {
  const bare = (i: number) => i + 1 >= argv.length || argv[i + 1].startsWith('-');
  return argv.map((arg, i) => (arg === '--remote' && bare(i) ? '--remote=preview' : arg));
}
