// oclif needs a command's words first; people also write flags before them (`foliwake --site a site status`,
// `foliwake --debug whoami`). This moves the words of a known command to the front and keeps every flag and
// value in its order. `--` ends the search: what follows is positional.

/** Positions of the first two words (non-flag arguments) before `--`, skipping the values of value flags. */
function wordPositions(argv: readonly string[], takesValue: (name: string) => boolean): number[] {
  const positions: number[] = [];
  for (let i = 0; i < argv.length && positions.length < 2; i++) {
    const arg = argv[i];
    if (arg === '--') break;
    if (!arg.startsWith('-')) positions.push(i);
    else if (arg.startsWith('--') && !arg.includes('=') && takesValue(arg.slice(2))) i++;
  }
  return positions;
}

/**
 * The arguments with the command words first, or null when no known command is named before `--`.
 * `takesValue` says which `--name` consumes the next argument; `ids`: the commands, words joined by `:`.
 */
export function commandWordsFirst(
  argv: readonly string[],
  takesValue: (name: string) => boolean,
  ids: ReadonlySet<string>,
): string[] | null {
  const rest = [...argv];
  const positions = wordPositions(rest, takesValue);
  const words = positions.map((position) => rest[position]);
  const count = ids.has(words.join(':')) ? 2 : ids.has(words[0] ?? '') ? 1 : 0;
  if (count === 0) return null;
  for (const position of positions.slice(0, count).reverse()) rest.splice(position, 1);
  return [...words.slice(0, count), ...rest];
}
