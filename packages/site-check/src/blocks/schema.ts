// JSON Schema of a block definition, `components/<name>/<name>.json`, generated from the checker's own
// tables in pack.ts: every key the checker accepts is here and no other (`additionalProperties: false`), with
// the same name patterns, enums and bounds. Rules a schema cannot state well (max ≥ min, a rule per variant,
// binding ambiguity) stay with the checker. A test keeps this schema equal to the tables.

import {
  FIELD_ROLES,
  ID_VALUE,
  MAX_DESCRIPTION,
  MAX_HELP,
  MAX_KEYWORDS,
  MAX_WORD,
  TOKEN,
  VIEW_ACCENTS,
  VIEW_KINDS,
} from './authoring-keys.js';
import { CORE_EVENT_TYPES, EVENT_NAME, EVENT_VALUE_TYPES, UI_KEY, UI_LANG } from './extras.js';
import {
  ARGUMENT_KEYS,
  BLOCK_KEYS,
  CORRECT_RULES,
  FIELD_KEYS,
  type FieldType,
  ANSWER_ID_RULES,
  MAX_PATTERN,
  NAME,
  VARIANT,
} from './pack.js';

export const BLOCK_SCHEMA_VERSION = 1;
export const BLOCK_SCHEMA_ID = `urn:foliwake:block-definition:${BLOCK_SCHEMA_VERSION}`;
/** The schema's file name: `.foliwake/schemas/<this>` in a site folder, and where `foliwake dev` serves it. */
export const BLOCK_SCHEMA_FILE = `block-${BLOCK_SCHEMA_VERSION}.schema.json`;

type Schema = Record<string, unknown>;

const LABEL: Schema = {
  type: 'object',
  description:
    'For editors: language → text, e.g. {"en": "Question", "ru": "Вопрос"}. Not part of the HTML or of the ' +
    "definition's signature.",
  additionalProperties: { type: 'string', minLength: 1 },
};

// Keys for authoring tools (authoring-keys.ts): checked by the engine, never part of the HTML or of the
// signature, carried in blocks.json for editor packages.
const TEXTS = (what: string, max: number): Schema => ({
  type: 'object',
  description:
    `${what} For authoring tools: language → text (at most ${max} characters). Not part of the HTML or of ` +
    `the definition's signature.`,
  propertyNames: { pattern: UI_LANG.source },
  additionalProperties: { type: 'string', minLength: 1, maxLength: max },
});
const TOKEN_OF = (what: string): Schema => ({
  type: 'string',
  pattern: TOKEN.source,
  description: `${what} A name of lowercase letters, digits and "-" (at most 64).`,
});
const VIEW: Schema = {
  type: 'object',
  description: 'How an editor shows the block: what it is and its accent, as roles (the editor picks its own colours).',
  properties: { kind: { enum: [...VIEW_KINDS] }, accent: { enum: [...VIEW_ACCENTS] } },
  additionalProperties: false,
};
const FORMAT = TOKEN_OF(
  'The name of a syntax an authoring tool may know for this text (opaque to the engine), e.g. "music-notation".',
);

const nameOf = (what: string): Schema => ({
  type: 'string',
  pattern: NAME.source,
  description: `${what}: lowercase letters, digits and "-", starting with a letter (at most 32).`,
});

const TYPES: Readonly<Record<FieldType, string>> = {
  heading:
    'A `##`/`###`/`####` heading (its level is `level`). HTML: `<h3 data-field="name">`; `{#id}` at its end gives it ' +
    'an `id`.',
  text: 'A paragraph. HTML: `<p data-field="name">`.',
  list: 'A bullet list. HTML: `<ul data-field="name"><li data-item>…`.',
  choices:
    'A task list `- [ ] …` / `- [x] … {#a1}`. HTML: `<ul data-field="name" data-select="single|multiple"><li ' +
    'data-item data-option-id data-correct>…`.',
  quote: 'A block quote of paragraphs. HTML: `<blockquote data-field="name"><p>…`.',
  image:
    'A paragraph that is one image `![alt](path "caption")`. HTML: `<figure data-field="name"><img …><figcaption>`.',
};

function keySchema(type: FieldType, key: string): Schema {
  switch (key) {
    case 'name':
      return nameOf('The field name, `data-field` in the HTML');
    case 'type':
      return { const: type, description: TYPES[type] };
    case 'label':
      return LABEL;
    case 'level':
      return { enum: [2, 3, 4], description: 'Heading level of the field: 2 reads `##`, 3 `###`, 4 `####`.' };
    case 'min':
      return { type: 'integer', minimum: 0, default: 1, description: 'Fewest occurrences (0 = optional). Default 1.' };
    case 'max':
      return type === 'list' || type === 'choices'
        ? { const: 1, description: 'A list occurs once; count its items with minItems/maxItems.' }
        : {
            type: ['integer', 'null'],
            minimum: 1,
            default: 1,
            description:
              'Most occurrences, at least max(min, 1); null = any number. With max ≠ 1 the occurrences are wrapped ' +
              'in one `<div data-field="name">`. Default 1.',
          };
    case 'minItems':
      return { type: 'integer', minimum: 1, description: `Fewest items. Default ${type === 'choices' ? 2 : 1}.` };
    case 'maxItems':
      return {
        type: ['integer', 'null'],
        minimum: 1,
        description: 'Most items (at least minItems); null = any number. Default null.',
      };
    case 'ids':
      return {
        enum: [...ANSWER_ID_RULES],
        default: 'optional',
        description: 'Answer IDs `{#a1}`: required, optional (all or none) or forbidden.',
      };
    case 'correct':
      return {
        type: 'object',
        description:
          'Right-answer rule per variant ("" = the bare form); every variant needs one. Default: "any" for each.',
        propertyNames: { pattern: `^(?:|${VARIANT.source.slice(1, -1)})$` },
        additionalProperties: { enum: [...CORRECT_RULES] },
      };
    case 'itemQuote':
      return nameOf(
        'Allows a block quote directly under an answer; its `data-field` is this name, which no field of the block ' +
          'may have',
      );
    case 'help':
      return TEXTS('A hint shown next to the field.', MAX_HELP);
    case 'add_label':
      return TEXTS('The label of the action that adds one more occurrence or item ("Add an answer").', MAX_HELP);
    case 'placeholder':
      return TEXTS('The placeholder of an empty field.', MAX_HELP);
    case 'role':
      return { enum: [...FIELD_ROLES], description: 'What the field is in the block, for authoring tools.' };
    case 'format':
      return FORMAT;
    case 'idValues':
      return {
        type: 'object',
        description:
          'Known answer ids `{#id}` of this choices field: answer id → {"label", "icon", "exclusive" (choosing it ' +
          'clears the others), "alias": {variant: id}}.',
        propertyNames: { pattern: ID_VALUE.source },
        additionalProperties: {
          type: 'object',
          properties: {
            label: TEXTS("The id's label.", MAX_HELP),
            icon: TOKEN_OF("An icon of the site's editor icons."),
            exclusive: { type: 'boolean' },
            alias: {
              type: 'object',
              description: 'Variant → the id this value has in that variant.',
              additionalProperties: { type: 'string', pattern: ID_VALUE.source },
            },
          },
          additionalProperties: false,
        },
      };
    case 'itemQuoteLabel':
      return TEXTS('The label of the quote under an answer (`itemQuote`).', MAX_HELP);
    default:
      throw new Error(`block schema: no schema for the ${type} key "${key}"`);
  }
}

function argumentKeySchema(key: string): Schema {
  switch (key) {
    case 'name':
      return nameOf("The argument's name");
    case 'label':
      return LABEL;
    case 'pattern':
      return {
        type: 'string',
        pattern: '^\\^.*\\$$',
        maxLength: MAX_PATTERN,
        description: 'An anchored regular expression (^…$, Unicode), at most 256 characters.',
      };
    case 'help':
      return TEXTS('A hint for the argument.', MAX_HELP);
    case 'placeholder':
      return TEXTS('The placeholder of an empty argument.', MAX_HELP);
    case 'format':
      return FORMAT;
    default:
      throw new Error(`block schema: no schema for the argument key "${key}"`);
  }
}

function fieldSchema(type: FieldType): Schema {
  const keys = FIELD_KEYS[type];
  return {
    type: 'object',
    title: `${type} field`,
    description: TYPES[type],
    required: type === 'heading' ? ['name', 'type', 'level'] : ['name', 'type'],
    properties: Object.fromEntries(keys.map((key) => [key, keySchema(type, key)])),
    additionalProperties: false,
  };
}

/** The JSON Schema (draft-07) of `components/<name>/<name>.json`. */
export function blockDefinitionSchema(): Schema {
  const blockKeys: Record<string, Schema> = {
    label: { ...LABEL, description: "The block's name for editors: language → text." },
    argument: {
      type: 'object',
      description:
        'A word after the block name, `:::name <word>`, checked by `pattern`; rendered as `data-argument`. Not ' +
        'together with "variants".',
      required: ['name', 'pattern'],
      properties: Object.fromEntries(ARGUMENT_KEYS.map((key) => [key, argumentKeySchema(key)])),
      additionalProperties: false,
    },
    variants: {
      type: 'object',
      description:
        'Allowed words after the block name, word → label ("" = the bare `:::name`); ' +
        'rendered as `data-variant`. Not together with "argument".',
      minProperties: 1,
      propertyNames: { pattern: `^(?:|${VARIANT.source.slice(1, -1)})$` },
      additionalProperties: LABEL,
    },
    fields: {
      type: 'array',
      description: "The block's fields in order; content is bound to them by order and kind.",
      minItems: 1,
      items: { oneOf: (Object.keys(FIELD_KEYS) as FieldType[]).map(fieldSchema) },
    },
    ui: {
      type: 'object',
      description:
        "The block's own labels for its JavaScript (block-kit `ctx.t(key)`): UI language → key → text. The app's " +
        '`host.labels` win; then the UI language, its base language, English, the key. Not part of the HTML or of ' +
        'the signature.',
      propertyNames: { pattern: UI_LANG.source },
      additionalProperties: {
        type: 'object',
        propertyNames: { pattern: UI_KEY.source },
        additionalProperties: { type: 'string', minLength: 1 },
      },
    },
    events: {
      type: 'object',
      description:
        `The events the block's JavaScript emits (block-kit \`ctx.emit(type, detail)\`), for the ` +
        `generated types: type → {"detail": {property: type}}. Not ${CORE_EVENT_TYPES.join(' or ')}, ` +
        'whose detail the contract fixes; "key" and "block" are added by the kit.',
      propertyNames: { pattern: EVENT_NAME.source, not: { enum: [...CORE_EVENT_TYPES] } },
      additionalProperties: {
        type: 'object',
        properties: { detail: { type: 'object', additionalProperties: { enum: [...EVENT_VALUE_TYPES] } } },
        additionalProperties: false,
      },
    },
    description: TEXTS('What the block is for.', MAX_DESCRIPTION),
    keywords: {
      type: 'object',
      description:
        `Words an editor finds the block by: language → list (at most ${MAX_KEYWORDS} words). For ` +
        `authoring tools only.`,
      propertyNames: { pattern: UI_LANG.source },
      additionalProperties: {
        type: 'array',
        maxItems: MAX_KEYWORDS,
        items: { type: 'string', minLength: 1, maxLength: MAX_WORD },
      },
    },
    group: TOKEN_OF("The group of the block in an editor's palette (`groups` of components/editor.json)."),
    icon: TOKEN_OF("The block's icon in an editor (a file of the icons folder of components/editor.json)."),
    view: VIEW,
    presets: {
      type: 'array',
      uniqueItems: true,
      description: "Example ids `{#id}` of the block's .example.md that editors offer as ready-made content.",
      items: { type: 'string', pattern: TOKEN.source },
    },
    editors: {
      type: 'object',
      description: 'Per editor target: only its view and icon.',
      propertyNames: { pattern: TOKEN.source },
      additionalProperties: {
        type: 'object',
        properties: { view: VIEW, icon: TOKEN_OF('The icon for this target.') },
        additionalProperties: false,
      },
    },
    index: {
      type: 'array',
      description: 'Fields of this block that a build extension may index (for example for search), by name.',
      uniqueItems: true,
      items: nameOf('A field of this block'),
    },
  };
  for (const key of BLOCK_KEYS)
    if (!blockKeys[key]) throw new Error(`block schema: no schema for the block key "${key}"`);
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: BLOCK_SCHEMA_ID,
    title: 'Foliwake block definition',
    description: 'components/<name>/<name>.json: the fields of a site block.',
    type: 'object',
    required: ['fields'],
    properties: {
      $schema: { type: 'string', description: 'This schema, for editors; the engine ignores it.' },
      ...Object.fromEntries(BLOCK_KEYS.map((key) => [key, blockKeys[key]])),
    },
    additionalProperties: false,
    not: { required: ['argument', 'variants'] },
  };
}

/** The schema file's text, as written into a site folder and served. */
export function blockSchemaText(): string {
  return `${JSON.stringify(blockDefinitionSchema(), null, 2)}\n`;
}
