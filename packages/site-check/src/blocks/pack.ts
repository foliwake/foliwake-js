// Site block pack, format `foliwake-blocks/1`, assembled from the block folders by site-code.ts.
// The site declares its blocks as data; the engine owns the field types, the Markdown readers and the HTML.
// A pack is checked completely before use: unknown keys are errors, and every block must bind its content in
// exactly one way, proven here on the field automaton.

import { createHash } from 'node:crypto';

import {
  ARGUMENT_AUTHORING_KEYS,
  BLOCK_AUTHORING_KEYS,
  type BlockAuthoring,
  CHOICES_AUTHORING_KEYS,
  FIELD_AUTHORING_KEYS,
  type FieldAuthoring,
  parseArgumentAuthoring,
  parseBlockAuthoring,
  parseFieldAuthoring,
} from './authoring-keys.js';
import { type BlockExtras, parseBlockExtras } from './extras.js';

export const PACK_SCHEMA = 'foliwake-blocks/1';

/** The engine's own block name (section metadata): a site cannot define it. */
export const SECTION_METADATA_BLOCK = 'section-metadata';

export const NAME = /^[a-z][a-z0-9-]{0,31}$/;
export const VARIANT = /^[a-z][a-z0-9-]{0,31}$/;
export const MAX_PATTERN = 256;

export type FieldType = 'text' | 'heading' | 'list' | 'choices' | 'quote' | 'image';
export type CorrectRule = 'exactly-one' | 'at-least-one' | 'any';
/** Token classes of block content; every token is in exactly one. */
export type TokenClass = 'h2' | 'h3' | 'h4' | 'paragraph' | 'image' | 'bullets' | 'tasks' | 'quote';

export interface PackField {
  name: string;
  type: FieldType;
  /** heading level 2–4 */
  level: number | null;
  /** how many times the field occurs: min…max (max null = unbounded) */
  min: number;
  max: number | null;
  /** items of a list or answers of choices */
  minItems: number;
  maxItems: number | null;
  /** choices: answer IDs `{#id}` */
  ids: 'required' | 'optional' | 'forbidden';
  /** choices: correct-answer rule per variant ("" = the bare form) */
  correct: Readonly<Record<string, CorrectRule>>;
  /**
   * choices: the `data-field` name of a block quote allowed under an answer.
   * Absent, not null, when the definition does not set it: every key here enters
   * the signature, and existing definitions must keep theirs.
   */
  itemQuote?: string;
}

export interface PackBlock {
  name: string;
  labels: Readonly<Record<string, string>>;
  argument: { name: string; pattern: RegExp } | null;
  /** allowed words after the name; null when the block has no variants */
  variants: ReadonlyMap<string, Readonly<Record<string, string>>> | null;
  fields: readonly PackField[];
  /** `ui`, `events` and `index`: for the block's JavaScript and build extensions, not its HTML (extras.ts) */
  extras: BlockExtras;
  /** keys for authoring tools (authoring-keys.ts); like labels, not in the signature */
  authoring: BlockAuthoring;
  /** sha256 of the definition without labels, ui, events and index: equal signatures render equal HTML */
  signature: string;
}

export interface BlockPack {
  /** sha256 of the pack's canonical JSON */
  digest: string;
  blocks: ReadonlyMap<string, PackBlock>;
}

export interface PackIssue {
  code: 'BLOCKS_PACK_INVALID' | 'BLOCKS_PACK_AMBIGUOUS';
  /** JSON pointer into the pack */
  pointer: string;
  message: string;
  fix: string | null;
}

export function tokenClassOf(field: PackField): TokenClass {
  switch (field.type) {
    case 'text':
      return 'paragraph';
    case 'heading':
      return `h${field.level}` as TokenClass;
    case 'list':
      return 'bullets';
    case 'choices':
      return 'tasks';
    case 'quote':
      return 'quote';
    case 'image':
      return 'image';
  }
}

/** Canonical JSON: sorted keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

// `label` and the authoring keys (authoring-keys.ts) are for editors: they are checked here and never enter
// PackField, so they stay out of the signature.
export const FIELD_KEYS: Readonly<Record<FieldType, readonly string[]>> = {
  text: ['name', 'type', 'label', 'min', 'max', ...FIELD_AUTHORING_KEYS],
  heading: ['name', 'type', 'label', 'level', 'min', 'max', ...FIELD_AUTHORING_KEYS],
  list: ['name', 'type', 'label', 'min', 'max', 'minItems', 'maxItems', ...FIELD_AUTHORING_KEYS],
  choices: [
    'name',
    'type',
    'label',
    'min',
    'max',
    'minItems',
    'maxItems',
    'ids',
    'correct',
    'itemQuote',
    ...FIELD_AUTHORING_KEYS,
    ...CHOICES_AUTHORING_KEYS,
  ],
  quote: ['name', 'type', 'label', 'min', 'max', ...FIELD_AUTHORING_KEYS],
  image: ['name', 'type', 'label', 'min', 'max', ...FIELD_AUTHORING_KEYS],
};
export const BLOCK_KEYS: readonly string[] = [
  'label',
  'argument',
  'variants',
  'fields',
  'ui',
  'events',
  'index',
  ...BLOCK_AUTHORING_KEYS,
];
export const ARGUMENT_KEYS: readonly string[] = ['name', 'label', 'pattern', ...ARGUMENT_AUTHORING_KEYS];
export const CORRECT_RULES: readonly string[] = ['exactly-one', 'at-least-one', 'any'];
export const ANSWER_ID_RULES: readonly string[] = ['required', 'optional', 'forbidden'];

/** Parses and validates a pack; `pack` is null when there is any issue. */
export function parsePack(text: string): { pack: BlockPack | null; issues: PackIssue[] } {
  const issues: PackIssue[] = [];
  const invalid = (pointer: string, message: string, fix: string | null = null): void => {
    issues.push({ code: 'BLOCKS_PACK_INVALID', pointer, message, fix });
  };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    invalid('', `The pack is not valid JSON: ${(error as Error).message}.`, 'Fix the JSON syntax.');
    return { pack: null, issues };
  }
  if (!isObject(json)) {
    invalid('', 'The pack must be a JSON object.', `Start with {"schema": "${PACK_SCHEMA}", "blocks": {…}}.`);
    return { pack: null, issues };
  }
  for (const key of Object.keys(json))
    if (key !== 'schema' && key !== 'blocks')
      invalid(`/${key}`, `Unknown key "${key}".`, 'Remove it; a pack has only "schema" and "blocks".');
  if (json.schema !== PACK_SCHEMA)
    invalid('/schema', `"schema" must be "${PACK_SCHEMA}".`, `Set "schema": "${PACK_SCHEMA}".`);
  if (!isObject(json.blocks) || Object.keys(json.blocks).length === 0) {
    invalid('/blocks', '"blocks" must be an object with at least one block.', null);
    return { pack: null, issues };
  }
  const blocks = new Map<string, PackBlock>();
  for (const [name, raw] of Object.entries(json.blocks)) {
    const at = `/blocks/${name}`;
    if (!NAME.test(name))
      invalid(
        at,
        `Invalid block name "${name}".`,
        'Use lowercase letters, digits and "-", starting with a letter (at most 32).',
      );
    if (name === SECTION_METADATA_BLOCK)
      invalid(at, `"${name}" is reserved by the engine; a site cannot define it.`, 'Choose another block name.');
    const block = parseBlock(name, raw, at, invalid);
    if (block) {
      const witness = ambiguityWitness(block.fields);
      if (witness) {
        issues.push({
          code: 'BLOCKS_PACK_AMBIGUOUS',
          pointer: `${at}/fields`,
          message: `Block "${name}" can bind the same content in two ways, e.g. ${witness.join(', ')}.`,
          fix:
            'Make one of the fields required, separate them by a required field of another kind, or merge them ' +
            'into one repeated field.',
        });
      } else blocks.set(name, block);
    }
  }
  if (issues.length > 0) return { pack: null, issues };
  return { pack: { digest: sha256(canonicalJson(json)), blocks }, issues };
}

const LABEL_RULE = 'A label must be an object of language → non-empty text, e.g. {"ru": "Вопрос", "en": "Question"}.';

function parseLabels(
  raw: unknown,
  at: string,
  invalid: (pointer: string, message: string, fix?: string | null) => void,
): Record<string, string> {
  if (raw === undefined) return {};
  if (!isObject(raw) || Object.values(raw).some((v) => typeof v !== 'string' || v === '')) {
    invalid(at, LABEL_RULE);
    return {};
  }
  return raw as Record<string, string>;
}

function parseBlock(
  name: string,
  raw: unknown,
  at: string,
  invalid: (pointer: string, message: string, fix?: string | null) => void,
): PackBlock | null {
  if (!isObject(raw)) {
    invalid(at, `Block "${name}" must be an object.`);
    return null;
  }
  let ok = true;
  const fail = (pointer: string, message: string, fix: string | null = null): void => {
    ok = false;
    invalid(pointer, message, fix);
  };
  const blockKeysHelp =
    'A block has "label", "fields", optionally "argument" or "variants", "ui", "events" and "index", and the ' +
    'authoring keys (description, keywords, group, icon, view, presets, editors).';
  for (const key of Object.keys(raw)) {
    if (!BLOCK_KEYS.includes(key)) fail(`${at}/${key}`, `Unknown key "${key}".`, blockKeysHelp);
  }
  const labels = parseLabels(raw.label, `${at}/label`, fail);
  let argument: PackBlock['argument'] = null;
  if (raw.argument !== undefined) {
    const arg = raw.argument;
    if (
      !isObject(arg) ||
      Object.keys(arg).some((k) => !ARGUMENT_KEYS.includes(k)) ||
      typeof arg.name !== 'string' ||
      !NAME.test(arg.name) ||
      typeof arg.pattern !== 'string'
    ) {
      fail(
        `${at}/argument`,
        '"argument" must be {"name": "<name>", "pattern": "<regular expression>"}, optionally with a "label".',
      );
    } else if (!arg.pattern.startsWith('^') || !arg.pattern.endsWith('$') || arg.pattern.length > MAX_PATTERN) {
      fail(`${at}/argument/pattern`, 'The argument pattern must be anchored (^…$) and at most 256 characters.');
    } else {
      try {
        argument = { name: arg.name, pattern: new RegExp(arg.pattern, 'u') };
      } catch {
        fail(`${at}/argument/pattern`, 'The argument pattern is not a valid regular expression.');
      }
    }
    if (isObject(arg)) parseLabels(arg.label, `${at}/argument/label`, fail);
  }
  const argumentAuthoring = isObject(raw.argument)
    ? parseArgumentAuthoring(raw.argument, `${at}/argument`, fail)
    : undefined;
  let variants: Map<string, Record<string, string>> | null = null;
  if (raw.variants !== undefined) {
    if (raw.argument !== undefined) fail(`${at}/variants`, 'A block has either "argument" or "variants", not both.');
    if (!isObject(raw.variants) || Object.keys(raw.variants).length === 0)
      fail(`${at}/variants`, '"variants" must be an object of variant word → label.');
    else {
      variants = new Map();
      for (const [word, label] of Object.entries(raw.variants)) {
        if (word !== '' && !VARIANT.test(word))
          fail(
            `${at}/variants/${word}`,
            `Invalid variant "${word}".`,
            'Use "" for the bare form, else lowercase letters, digits and "-".',
          );
        variants.set(word, parseLabels(label, `${at}/variants/${word}`, fail));
      }
    }
  }
  const words = variants ? [...variants.keys()] : [''];
  const fields: PackField[] = [];
  const fieldAuthoring: Record<string, FieldAuthoring> = {};
  if (!Array.isArray(raw.fields) || raw.fields.length === 0) fail(`${at}/fields`, '"fields" must be a non-empty list.');
  else {
    const names = new Set<string>();
    const declaredNames = new Set<unknown>(raw.fields.map(declaredName));
    raw.fields.forEach((entry, index) => {
      const field = parseField(entry, `${at}/fields/${index}`, words, declaredNames, fail);
      if (!field) return;
      if (names.has(field.name)) fail(`${at}/fields/${index}/name`, `Field "${field.name}" is declared twice.`);
      names.add(field.name);
      fields.push(field);
      const choices = field.type === 'choices' ? { variants: words, itemQuote: field.itemQuote !== undefined } : null;
      fieldAuthoring[field.name] = parseFieldAuthoring(
        entry as Record<string, unknown>,
        `${at}/fields/${index}`,
        choices,
        fail,
      );
    });
  }
  const extras = parseBlockExtras(raw, at, new Set(fields.map((field) => field.name)), fail);
  const authoring: BlockAuthoring = {
    ...parseBlockAuthoring(raw, at, fail),
    fields: fieldAuthoring,
    argument: argumentAuthoring,
  };
  if (!ok) return null;
  const definition = {
    argument: raw.argument === undefined ? null : { name: argument!.name, pattern: argument!.pattern.source },
    variants: variants ? [...variants.keys()].sort() : null,
    fields: fields.map((f) => ({ ...f })),
  };
  return {
    name,
    labels,
    argument,
    variants,
    fields,
    extras,
    authoring,
    signature: sha256(canonicalJson({ name, ...definition })),
  };
}

function declaredName(entry: unknown): unknown {
  return isObject(entry) ? entry.name : undefined;
}

/** Why this `itemQuote` value cannot be used; null when it can. One `data-field` name means one thing in a block. */
function itemQuoteProblem(value: unknown, declaredNames: ReadonlySet<unknown>): string | null {
  if (typeof value !== 'string' || !NAME.test(value))
    return '"itemQuote" must be a name of lowercase letters, digits and "-", like a field name.';
  if (declaredNames.has(value)) return `"itemQuote" cannot be "${value}": a field of this block has that name.`;
  return null;
}

function parseField(
  raw: unknown,
  at: string,
  words: readonly string[],
  declaredNames: ReadonlySet<unknown>,
  fail: (pointer: string, message: string, fix?: string | null) => void,
): PackField | null {
  if (!isObject(raw)) {
    fail(at, 'A field must be an object.');
    return null;
  }
  const type = raw.type;
  if (typeof type !== 'string' || !Object.hasOwn(FIELD_KEYS, type)) {
    fail(
      `${at}/type`,
      `Unknown field type ${JSON.stringify(type)}.`,
      'Use one of: text, heading, list, choices, quote, image.',
    );
    return null;
  }
  const fieldType = type as FieldType;
  let ok = true;
  const bad = (pointer: string, message: string, fix: string | null = null): void => {
    ok = false;
    fail(pointer, message, fix);
  };
  for (const key of Object.keys(raw))
    if (!FIELD_KEYS[fieldType].includes(key))
      bad(
        `${at}/${key}`,
        `Unknown key "${key}" for a ${fieldType} field.`,
        `A ${fieldType} field has: ${FIELD_KEYS[fieldType].join(', ')}.`,
      );
  if (typeof raw.name !== 'string' || !NAME.test(raw.name))
    bad(`${at}/name`, 'A field needs a "name" of lowercase letters, digits and "-".');
  parseLabels(raw.label, `${at}/label`, bad);
  const min = raw.min === undefined ? 1 : raw.min;
  const max = raw.max === undefined ? 1 : raw.max;
  if (!isCount(min)) bad(`${at}/min`, '"min" must be a whole number ≥ 0.');
  if (max !== null && (!isCount(max) || max < 1 || (isCount(min) && max < min)))
    bad(`${at}/max`, '"max" must be null (unbounded) or a whole number ≥ max(min, 1).');
  if ((fieldType === 'list' || fieldType === 'choices') && max !== 1)
    bad(`${at}/max`, `A ${fieldType} field occurs at most once; its items are counted by "minItems"/"maxItems".`);
  let level: number | null = null;
  if (fieldType === 'heading') {
    if (raw.level !== 2 && raw.level !== 3 && raw.level !== 4)
      bad(`${at}/level`, 'A heading field needs "level" 2, 3 or 4.');
    else level = raw.level;
  }
  const minItems = raw.minItems === undefined ? (fieldType === 'choices' ? 2 : 1) : raw.minItems;
  const maxItems = raw.maxItems === undefined ? null : raw.maxItems;
  if (!isCount(minItems) || minItems < 1) bad(`${at}/minItems`, '"minItems" must be a whole number ≥ 1.');
  if (maxItems !== null && (!isCount(maxItems) || (isCount(minItems) && maxItems < minItems)))
    bad(`${at}/maxItems`, '"maxItems" must be null or a whole number ≥ minItems.');
  const ids = raw.ids === undefined ? 'optional' : raw.ids;
  if (typeof ids !== 'string' || !ANSWER_ID_RULES.includes(ids))
    bad(`${at}/ids`, '"ids" must be "required", "optional" or "forbidden".');
  const correct: Record<string, CorrectRule> = {};
  if (fieldType === 'choices') {
    if (raw.correct === undefined) for (const word of words) correct[word] = 'any';
    else if (!isObject(raw.correct))
      bad(
        `${at}/correct`,
        '"correct" must map each variant ("" = bare form) to "exactly-one", "at-least-one" or "any".',
      );
    else {
      for (const [word, rule] of Object.entries(raw.correct)) {
        if (!words.includes(word)) bad(`${at}/correct/${word}`, `"${word}" is not a variant of this block.`);
        else if (typeof rule !== 'string' || !CORRECT_RULES.includes(rule))
          bad(`${at}/correct/${word}`, 'The rule must be "exactly-one", "at-least-one" or "any".');
        else correct[word] = rule as CorrectRule;
      }
      for (const word of words)
        if (!(word in correct))
          bad(
            `${at}/correct`,
            `No rule for variant ${JSON.stringify(word)}.`,
            'Give every variant a rule (use "any" when correctness is not checked).',
          );
    }
  }
  if (fieldType === 'choices' && raw.itemQuote !== undefined) {
    const problem = itemQuoteProblem(raw.itemQuote, declaredNames);
    if (problem) bad(`${at}/itemQuote`, problem);
  }
  if (!ok) return null;
  const field: PackField = {
    name: raw.name as string,
    type: fieldType,
    level,
    min: min as number,
    max: max as number | null,
    minItems: minItems as number,
    maxItems: maxItems as number | null,
    ids: ids as PackField['ids'],
    correct,
  };
  if (typeof raw.itemQuote === 'string') field.itemQuote = raw.itemQuote;
  return field;
}

// ---- uniqueness of binding ----------------------------------------------------

const TOKEN_CLASSES: readonly TokenClass[] = ['h2', 'h3', 'h4', 'paragraph', 'image', 'bullets', 'tasks', 'quote'];

/** A position in the field sequence: field `i` (−1 = before the first) with `count` tokens taken (saturated). */
type State = { i: number; count: number };
const key = (s: State): string => `${s.i}:${s.count}`;
const cap = (field: PackField): number => (field.max === null ? Math.max(field.min, 1) : field.max);

/** Moves of one automaton step: the field that takes the token and the next state. */
export function stepStates(
  fields: readonly PackField[],
  state: State,
  token: TokenClass,
): Array<{ field: number; next: State }> {
  const moves: Array<{ field: number; next: State }> = [];
  if (state.i >= 0) {
    const field = fields[state.i];
    if (tokenClassOf(field) === token && (field.max === null || state.count < field.max)) {
      moves.push({ field: state.i, next: { i: state.i, count: Math.min(state.count + 1, cap(field)) } });
    }
  }
  const done = state.i < 0 || state.count >= fields[state.i].min;
  if (!done) return moves;
  for (let j = state.i + 1; j < fields.length; j += 1) {
    if (tokenClassOf(fields[j]) === token) moves.push({ field: j, next: { i: j, count: 1 } });
    if (fields[j].min > 0) break;
  }
  return moves;
}

export function isAccepting(fields: readonly PackField[], state: State): boolean {
  if (state.i >= 0 && state.count < fields[state.i].min) return false;
  for (let j = state.i + 1; j < fields.length; j += 1) if (fields[j].min > 0) return false;
  return true;
}

export const START: State = Object.freeze({ i: -1, count: 0 });

/**
 * A shortest token-class sequence with two different field assignments, or
 * null when every accepted sequence binds in exactly one way. Breadth-first
 * search over pairs of states with a "the assignments differed" flag (the flag
 * survives paths that merge again).
 */
export function ambiguityWitness(fields: readonly PackField[]): TokenClass[] | null {
  type Pair = { a: State; b: State; diverged: boolean };
  const pairKey = (p: Pair): string => `${key(p.a)}|${key(p.b)}|${p.diverged ? 1 : 0}`;
  const start: Pair = { a: START, b: START, diverged: false };
  const parent = new Map<string, { from: string; token: TokenClass } | null>([[pairKey(start), null]]);
  const nodes = new Map<string, Pair>([[pairKey(start), start]]);
  const queue: Pair[] = [start];
  while (queue.length > 0) {
    const pair = queue.shift()!;
    const id = pairKey(pair);
    if (pair.diverged && isAccepting(fields, pair.a) && isAccepting(fields, pair.b)) {
      const witness: TokenClass[] = [];
      for (let at = parent.get(id); at; at = parent.get(at.from)) witness.unshift(at.token);
      return witness;
    }
    for (const token of TOKEN_CLASSES) {
      for (const ma of stepStates(fields, pair.a, token)) {
        for (const mb of stepStates(fields, pair.b, token)) {
          const next: Pair = { a: ma.next, b: mb.next, diverged: pair.diverged || ma.field !== mb.field };
          const nextId = pairKey(next);
          if (parent.has(nextId)) continue;
          parent.set(nextId, { from: id, token });
          nodes.set(nextId, next);
          queue.push(next);
        }
      }
    }
  }
  return null;
}
