// The parts of a block definition for its JavaScript, not its HTML: `ui` (the block's labels by UI language,
// read by the kit's `t()` through components.json), `events` (the types its `emit` sends, with their detail)
// and `index` (fields a build extension may index). None of them enters the definition's signature: equal
// signatures still render equal HTML.

/** A detail property's type in `events` (the generated `.d.ts` maps it to TypeScript). */
export const EVENT_VALUE_TYPES: readonly string[] = Object.freeze([
  'string',
  'number',
  'boolean',
  'string[]',
  'number[]',
  'boolean[]',
  'object',
  'unknown',
]);
/** Event types of the blocks contract's core; a block does not redefine them. */
export const CORE_EVENT_TYPES: readonly string[] = Object.freeze(['ready', 'error']);
export const UI_LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/;
export const UI_KEY = /^[a-z][A-Za-z0-9_.-]{0,63}$/;
export const EVENT_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const DETAIL_KEY = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

export interface BlockEventSpec {
  /** detail property → one of EVENT_VALUE_TYPES */
  detail: Readonly<Record<string, string>>;
}

export interface BlockExtras {
  /** UI language → key → text */
  ui: Readonly<Record<string, Readonly<Record<string, string>>>>;
  events: Readonly<Record<string, BlockEventSpec>>;
  index: readonly string[];
}

type Fail = (pointer: string, message: string, fix?: string | null) => void;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function parseUi(raw: unknown, at: string, fail: Fail): BlockExtras['ui'] {
  if (raw === undefined) return {};
  if (!isObject(raw)) {
    fail(at, '"ui" must be an object of UI language → {key: text}, e.g. {"en": {"more": "More"}}.');
    return {};
  }
  const out: Record<string, Record<string, string>> = {};
  for (const [lang, labels] of Object.entries(raw)) {
    if (!UI_LANG.test(lang)) fail(`${at}/${lang}`, `"${lang}" is not a language tag such as "en" or "pt-BR".`);
    else if (
      !isObject(labels) ||
      Object.entries(labels).some(([key, text]) => !UI_KEY.test(key) || typeof text !== 'string' || text === '')
    ) {
      fail(
        `${at}/${lang}`,
        'Labels must be an object of key → non-empty text; a key starts with a lowercase letter (letters, digits, ' +
          '"_", ".", "-", at most 64).',
      );
    } else out[lang] = labels as Record<string, string>;
  }
  return out;
}

function parseEvents(raw: unknown, at: string, fail: Fail): BlockExtras['events'] {
  if (raw === undefined) return {};
  if (!isObject(raw)) {
    fail(at, '"events" must be an object of event type → {"detail": {property: type}}.');
    return {};
  }
  const out: Record<string, BlockEventSpec> = {};
  for (const [type, spec] of Object.entries(raw)) {
    const where = `${at}/${type}`;
    if (!EVENT_NAME.test(type)) {
      fail(
        where,
        `"${type}" is not an event type: lowercase letters, digits and "-", starting with a letter (at most 32).`,
      );
      continue;
    }
    if (CORE_EVENT_TYPES.includes(type)) {
      fail(where, `"${type}" is an event of the blocks contract's core; its detail is fixed.`, 'Remove it.');
      continue;
    }
    const detail = isObject(spec) && Object.keys(spec).every((key) => key === 'detail') ? (spec.detail ?? {}) : null;
    if (
      !isObject(detail) ||
      Object.entries(detail).some(
        ([key, value]) =>
          !DETAIL_KEY.test(key) || key === 'key' || key === 'block' || !EVENT_VALUE_TYPES.includes(value as string),
      )
    ) {
      fail(
        where,
        `An event is {"detail": {property: type}} with types ${EVENT_VALUE_TYPES.join(', ')}; ` +
          '"key" and "block" are added by the kit.',
      );
      continue;
    }
    out[type] = { detail: detail as Record<string, string> };
  }
  return out;
}

function parseIndex(raw: unknown, at: string, fieldNames: ReadonlySet<string>, fail: Fail): readonly string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((name) => typeof name !== 'string')) {
    fail(at, '"index" must be a list of field names.');
    return [];
  }
  const names = raw as string[];
  names.forEach((name, i) => {
    if (!fieldNames.has(name)) fail(`${at}/${i}`, `"${name}" is not a field of this block.`);
    else if (names.indexOf(name) !== i) fail(`${at}/${i}`, `"${name}" is listed twice.`);
  });
  return names;
}

/** The `ui`, `events` and `index` of a block definition; problems go to `fail`. */
export function parseBlockExtras(
  raw: Record<string, unknown>,
  at: string,
  fieldNames: ReadonlySet<string>,
  fail: Fail,
): BlockExtras {
  return {
    ui: parseUi(raw.ui, `${at}/ui`, fail),
    events: parseEvents(raw.events, `${at}/events`, fail),
    index: parseIndex(raw.index, `${at}/index`, fieldNames, fail),
  };
}
