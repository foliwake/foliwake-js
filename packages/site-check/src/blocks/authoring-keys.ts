// Keys of a block definition for authoring tools: what an editor package generated from the site's blocks
// needs besides the fields — help texts, roles, icons, groups, the look of the block, presets from its
// examples. Like `label`, none of them changes the HTML: they are checked here, carried in blocks.json (the
// definitions as written) and never enter the definition's signature.
// Editor-specific names stay out: `editors.<target>` holds only a view and an icon for one target.
import { OPTION_ID_PATTERN } from '../formats/constants.js';

/** Roles of a field in the block, for authoring tools. */
export const FIELD_ROLES: readonly string[] = Object.freeze([
  'prompt',
  'setup',
  'answers',
  'explanation',
  'after',
  'data',
  'caption',
]);
/** What a block is, for an editor's view of it (a role, not a colour). */
export const VIEW_KINDS: readonly string[] = Object.freeze(['card', 'callout', 'question', 'media', 'list', 'plain']);
/** The accent of a block's view (a role the editor maps to its own colours). */
export const VIEW_ACCENTS: readonly string[] = Object.freeze([
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
  'accent',
]);
/** A name: an icon, a group, a format, an editor target. */
export const TOKEN = /^[a-z][a-z0-9-]{0,63}$/;
/** A key of `idValues`: an answer id `{#id}`. */
export const ID_VALUE = OPTION_ID_PATTERN;
export const MAX_DESCRIPTION = 4096;
export const MAX_KEYWORDS = 32;
export const MAX_HELP = 1024;
export const MAX_WORD = 64;

/** Language → text. */
export type Texts = Readonly<Record<string, string>>;

export interface BlockView {
  kind?: string;
  accent?: string;
}

export interface IdValue {
  label?: Texts;
  icon?: string;
  /** choosing it clears the others (and choosing another clears it) */
  exclusive?: boolean;
  /** variant → the id this value has in that variant */
  alias?: Readonly<Record<string, string>>;
}

export interface FieldAuthoring {
  help?: Texts;
  add_label?: Texts;
  placeholder?: Texts;
  role?: string;
  format?: string;
  idValues?: Readonly<Record<string, IdValue>>;
  itemQuoteLabel?: Texts;
}

export interface ArgumentAuthoring {
  help?: Texts;
  placeholder?: Texts;
  format?: string;
}

/** The authoring keys of a block, checked; absent keys are absent. */
export interface BlockAuthoring {
  description?: Texts;
  keywords?: Readonly<Record<string, readonly string[]>>;
  group?: string;
  icon?: string;
  view?: BlockView;
  /** ids of the block's examples (`<name>.example.md`) offered as ready-made content */
  presets?: readonly string[];
  editors?: Readonly<Record<string, { view?: BlockView; icon?: string }>>;
  fields: Readonly<Record<string, FieldAuthoring>>;
  argument?: ArgumentAuthoring;
}

/** The block keys this module checks. */
export const BLOCK_AUTHORING_KEYS: readonly string[] = Object.freeze([
  'description',
  'keywords',
  'group',
  'icon',
  'view',
  'presets',
  'editors',
]);
/** The field keys this module checks, by whether the field is `choices`. */
export const FIELD_AUTHORING_KEYS: readonly string[] = Object.freeze([
  'help',
  'add_label',
  'placeholder',
  'role',
  'format',
]);
export const CHOICES_AUTHORING_KEYS: readonly string[] = Object.freeze(['idValues', 'itemQuoteLabel']);
export const ARGUMENT_AUTHORING_KEYS: readonly string[] = Object.freeze(['help', 'placeholder', 'format']);

type Fail = (pointer: string, message: string, fix?: string | null) => void;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/;

/** The length of a text in Unicode code points, as JSON Schema's maxLength counts it (not UTF-16 units). */
export function codePoints(text: string): number {
  return [...text].length;
}

/** A non-empty text of at most `max` code points. */
function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value !== '' && codePoints(value) <= max;
}

/** Language → non-empty text of at most `max` code points (labels, help texts; also components/editor.json). */
export function isTexts(value: unknown, max: number): value is Texts {
  if (!isObject(value)) return false;
  return Object.entries(value).every(([lang, text]) => LANG.test(lang) && isText(text, max));
}

function texts(raw: unknown, at: string, fail: Fail, max: number): Texts | undefined {
  if (raw === undefined) return undefined;
  if (!isTexts(raw, max)) {
    fail(at, `Must be an object of language → non-empty text (at most ${max} characters), e.g. {"en": "…"}.`);
    return undefined;
  }
  return raw;
}

function token(raw: unknown, at: string, fail: Fail, what: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !TOKEN.test(raw)) {
    fail(at, `${what} must be a name of lowercase letters, digits and "-", starting with a letter (at most 64).`);
    return undefined;
  }
  return raw;
}

function view(raw: unknown, at: string, fail: Fail): BlockView | undefined {
  if (raw === undefined) return undefined;
  if (!isObject(raw) || Object.keys(raw).some((key) => key !== 'kind' && key !== 'accent')) {
    fail(at, '"view" must be {"kind": …, "accent": …}.');
    return undefined;
  }
  if (raw.kind !== undefined && !VIEW_KINDS.includes(raw.kind as string))
    fail(`${at}/kind`, `"kind" must be one of ${VIEW_KINDS.join(', ')}.`);
  if (raw.accent !== undefined && !VIEW_ACCENTS.includes(raw.accent as string))
    fail(`${at}/accent`, `"accent" must be one of ${VIEW_ACCENTS.join(', ')}.`);
  return raw as BlockView;
}

/** One language's keywords: at most MAX_KEYWORDS words of at most 64 code points. */
function isWordList(words: unknown): boolean {
  if (!Array.isArray(words) || words.length > MAX_KEYWORDS) return false;
  return words.every((word) => isText(word, MAX_WORD));
}

function keywords(raw: unknown, at: string, fail: Fail): BlockAuthoring['keywords'] {
  if (raw === undefined) return undefined;
  const valid = isObject(raw) && Object.entries(raw).every(([lang, words]) => LANG.test(lang) && isWordList(words));
  if (!valid) {
    fail(
      at,
      `"keywords" must be an object of language → list of words ` +
        `(at most ${MAX_KEYWORDS}, each at most 64 characters).`,
    );
    return undefined;
  }
  return raw as BlockAuthoring['keywords'];
}

function presets(raw: unknown, at: string, fail: Fail): readonly string[] | undefined {
  if (raw === undefined) return undefined;
  if (
    !Array.isArray(raw) ||
    raw.some((id) => typeof id !== 'string' || !TOKEN.test(id)) ||
    new Set(raw).size !== raw.length
  ) {
    fail(at, '"presets" must be a list of distinct example ids of the block (`{#id}` in its .example.md).');
    return undefined;
  }
  return raw as string[];
}

function editors(raw: unknown, at: string, fail: Fail): BlockAuthoring['editors'] {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) {
    fail(at, '"editors" must be an object of editor target → {"view": …, "icon": …}.');
    return undefined;
  }
  const out: Record<string, { view?: BlockView; icon?: string }> = {};
  for (const [target, entry] of Object.entries(raw)) {
    const where = `${at}/${target}`;
    if (!TOKEN.test(target)) {
      fail(where, `"${target}" is not an editor target name.`);
      continue;
    }
    if (!isObject(entry) || Object.keys(entry).some((key) => key !== 'view' && key !== 'icon')) {
      fail(where, 'An editor target has only "view" and "icon".');
      continue;
    }
    out[target] = {
      view: view(entry.view, `${where}/view`, fail),
      icon: token(entry.icon, `${where}/icon`, fail, '"icon"'),
    };
  }
  return out;
}

/** `alias` of an id value: a variant of the block → an answer id. */
function isAlias(alias: unknown, variants: readonly string[]): boolean {
  if (!isObject(alias)) return false;
  return Object.entries(alias).every(
    ([variant, other]) => variants.includes(variant) && typeof other === 'string' && ID_VALUE.test(other),
  );
}

function idValues(raw: unknown, at: string, variants: readonly string[], fail: Fail): FieldAuthoring['idValues'] {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) {
    fail(at, '"idValues" must be an object of answer id → {"label", "icon", "exclusive", "alias"}.');
    return undefined;
  }
  const out: Record<string, IdValue> = {};
  for (const [id, entry] of Object.entries(raw)) {
    const where = `${at}/${id}`;
    if (!ID_VALUE.test(id)) {
      fail(where, `"${id}" is not an answer id: a letter, then letters, digits, "_" and "-" (at most 64).`);
      continue;
    }
    if (!isObject(entry) || Object.keys(entry).some((key) => !['label', 'icon', 'exclusive', 'alias'].includes(key))) {
      fail(where, 'An id value has "label", "icon", "exclusive" and "alias" only.');
      continue;
    }
    if (entry.exclusive !== undefined && typeof entry.exclusive !== 'boolean')
      fail(`${where}/exclusive`, '"exclusive" must be true or false.');
    const alias = entry.alias;
    if (alias !== undefined && !isAlias(alias, variants)) {
      fail(
        `${where}/alias`,
        `"alias" must map variants of this block (${variants.map((v) => JSON.stringify(v)).join(', ')}) to answer ids.`,
      );
    }
    out[id] = {
      label: texts(entry.label, `${where}/label`, fail, MAX_HELP),
      icon: token(entry.icon, `${where}/icon`, fail, '"icon"'),
      exclusive: entry.exclusive as boolean | undefined,
      alias: alias as IdValue['alias'],
    };
  }
  return out;
}

/** The authoring keys of one field; `choices` fields also have `idValues` and `itemQuoteLabel`. */
export function parseFieldAuthoring(
  raw: Record<string, unknown>,
  at: string,
  choices: { variants: readonly string[]; itemQuote: boolean } | null,
  fail: Fail,
): FieldAuthoring {
  const out: FieldAuthoring = {
    help: texts(raw.help, `${at}/help`, fail, MAX_HELP),
    add_label: texts(raw.add_label, `${at}/add_label`, fail, MAX_HELP),
    placeholder: texts(raw.placeholder, `${at}/placeholder`, fail, MAX_HELP),
    format: token(raw.format, `${at}/format`, fail, '"format"'),
  };
  if (raw.role !== undefined) {
    if (FIELD_ROLES.includes(raw.role as string)) out.role = raw.role as string;
    else fail(`${at}/role`, `"role" must be one of ${FIELD_ROLES.join(', ')}.`);
  }
  if (choices) {
    out.idValues = idValues(raw.idValues, `${at}/idValues`, choices.variants, fail);
    if (raw.itemQuoteLabel !== undefined && !choices.itemQuote)
      fail(`${at}/itemQuoteLabel`, '"itemQuoteLabel" needs "itemQuote".');
    else out.itemQuoteLabel = texts(raw.itemQuoteLabel, `${at}/itemQuoteLabel`, fail, MAX_HELP);
  }
  return out;
}

/** The authoring keys of a block's argument. */
export function parseArgumentAuthoring(raw: Record<string, unknown>, at: string, fail: Fail): ArgumentAuthoring {
  return {
    help: texts(raw.help, `${at}/help`, fail, MAX_HELP),
    placeholder: texts(raw.placeholder, `${at}/placeholder`, fail, MAX_HELP),
    format: token(raw.format, `${at}/format`, fail, '"format"'),
  };
}

/** The block-level authoring keys (the fields' and the argument's are added by the caller). */
export function parseBlockAuthoring(
  raw: Record<string, unknown>,
  at: string,
  fail: Fail,
): Omit<BlockAuthoring, 'fields' | 'argument'> {
  return {
    description: texts(raw.description, `${at}/description`, fail, MAX_DESCRIPTION),
    keywords: keywords(raw.keywords, `${at}/keywords`, fail),
    group: token(raw.group, `${at}/group`, fail, '"group"'),
    icon: token(raw.icon, `${at}/icon`, fail, '"icon"'),
    view: view(raw.view, `${at}/view`, fail),
    presets: presets(raw.presets, `${at}/presets`, fail),
    editors: editors(raw.editors, `${at}/editors`, fail),
  };
}
