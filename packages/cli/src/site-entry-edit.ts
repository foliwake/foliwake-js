// Small edits of a site entry for `foliwake site set`:
// a dotted path (`media.resize`, `sources.0.settings.folderId`) and a value read as
// JSON when it parses (true, 3, {"a":1}, null), else as a string.
type Json = Record<string, unknown>;

export function parseValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const isContainer = (value: unknown): value is Json | unknown[] => value !== null && typeof value === 'object';

/** A copy of `entry` with `dotted` set to `value`, or removed when `value` is undefined. */
export function withPath(entry: Json, dotted: string, value: unknown): Json {
  const keys = dotted.split('.');
  if (keys.some((key) => key === '' || key === '__proto__' || key === 'constructor' || key === 'prototype'))
    throw new Error(`"${dotted}" is not a settings path`);
  const copy = structuredClone(entry);
  let at: Json | unknown[] = copy;
  for (const key of keys.slice(0, -1)) {
    const next: unknown = Array.isArray(at) ? at[Number(key)] : at[key];
    if (!isContainer(next)) {
      if (value === undefined) return copy;
      const made: Json = {};
      if (Array.isArray(at)) at[Number(key)] = made;
      else at[key] = made;
      at = made;
    } else at = next;
  }
  const last = keys[keys.length - 1] as string;
  if (Array.isArray(at)) {
    if (value === undefined) at.splice(Number(last), 1);
    else at[Number(last)] = value;
  } else if (value === undefined) delete at[last];
  else at[last] = value;
  return copy;
}
