// Keys of block definitions for authoring tools and components/editor.json: checked like the other keys, never in
// the signature; presets name examples of the block, a group one of editor.json's groups. Ported from the engine's
// tests (behaviour parity).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkCodeRelease } from '@foliwake/site-check';
import { parseEditorConfig } from '@foliwake/site-check/blocks/editor-config';
import { parsePack } from '@foliwake/site-check/blocks/pack';
import { blockDefinitionSchema } from '@foliwake/site-check/blocks/schema';

const pack = (blocks) => parsePack(JSON.stringify({ schema: 'foliwake-blocks/1', blocks }));
const pointersOf = (issues) => issues.map((issue) => issue.pointer);

const PLAIN = {
  variants: { '': { en: 'One' }, multiple: { en: 'Several' } },
  fields: [
    { name: 'question', type: 'heading', level: 3 },
    { name: 'options', type: 'choices', itemQuote: 'why', correct: { '': 'exactly-one', multiple: 'at-least-one' } },
    { name: 'explanation', type: 'text', min: 0, max: null },
  ],
};
const AUTHORED = {
  ...PLAIN,
  description: { en: 'A question with answers.', ru: 'Вопрос с ответами.' },
  keywords: { en: ['quiz', 'question'], ru: ['вопрос'] },
  group: 'questions',
  icon: 'quiz',
  view: { kind: 'question', accent: 'info' },
  presets: ['basic'],
  editors: { outline: { view: { kind: 'card' }, icon: 'quiz-alt' } },
  fields: [
    { ...PLAIN.fields[0], help: { en: 'Ask one thing.' }, placeholder: { en: 'Your question' }, role: 'prompt' },
    {
      ...PLAIN.fields[1],
      role: 'answers',
      add_label: { en: 'Add an answer' },
      format: 'plain-text',
      itemQuoteLabel: { en: 'Why' },
      idValues: {
        left: { label: { en: 'Left' }, icon: 'arrow-left', alias: { multiple: 'l' } },
        none: { label: { en: 'None of them' }, exclusive: true },
      },
    },
    { ...PLAIN.fields[2], role: 'explanation', help: { en: 'Shown after an answer.' } },
  ],
};

test('authoring keys: accepted, kept apart from the fields, not in the signature', () => {
  const plain = pack({ quiz: PLAIN });
  const authored = pack({ quiz: AUTHORED });
  assert.deepEqual(authored.issues, []);
  const block = authored.pack.blocks.get('quiz');
  assert.equal(block.signature, plain.pack.blocks.get('quiz').signature, 'equal HTML, equal signature');
  assert.deepEqual(block.fields, plain.pack.blocks.get('quiz').fields, 'no authoring key enters a PackField');
  assert.equal(block.authoring.group, 'questions');
  assert.deepEqual(block.authoring.view, { kind: 'question', accent: 'info' });
  assert.deepEqual(block.authoring.presets, ['basic']);
  assert.equal(block.authoring.fields.options.role, 'answers');
  const none = { label: { en: 'None of them' }, icon: undefined, exclusive: true, alias: undefined };
  assert.deepEqual(block.authoring.fields.options.idValues.none, none);
  const sceneArgument = {
    name: 'id',
    pattern: '^[a-z/]+$',
    help: { en: 'The scene id' },
    placeholder: { en: 'road/intro' },
    format: 'scene-id',
  };
  const argument = pack({ scene: { argument: sceneArgument, fields: [{ name: 'text', type: 'text' }] } });
  assert.deepEqual(argument.issues, []);
  const expected = { help: { en: 'The scene id' }, placeholder: { en: 'road/intro' }, format: 'scene-id' };
  assert.deepEqual(argument.pack.blocks.get('scene').authoring.argument, expected);
});

/** PLAIN with `extra` keys on its field `index`. */
function withField(index, extra) {
  return { ...PLAIN, fields: PLAIN.fields.map((f, i) => (i === index ? { ...f, ...extra } : f)) };
}

test('authoring keys: each wrong value is refused at its own pointer', () => {
  const noQuote = { ...PLAIN.fields[1], itemQuote: undefined, itemQuoteLabel: { en: 'Why' } };
  const cases = [
    [{ ...PLAIN, description: { en: 'x'.repeat(4097) } }, '/blocks/quiz/description'],
    [{ ...PLAIN, description: 'A question' }, '/blocks/quiz/description'],
    [{ ...PLAIN, keywords: ['quiz'] }, '/blocks/quiz/keywords'],
    [{ ...PLAIN, group: 'Questions' }, '/blocks/quiz/group'],
    [{ ...PLAIN, icon: 'quiz.svg' }, '/blocks/quiz/icon'],
    [{ ...PLAIN, view: { kind: 'banner' } }, '/blocks/quiz/view/kind'],
    [{ ...PLAIN, view: { accent: '#ff0000' } }, '/blocks/quiz/view/accent'],
    [{ ...PLAIN, view: { colour: 'red' } }, '/blocks/quiz/view'],
    [{ ...PLAIN, presets: ['basic', 'basic'] }, '/blocks/quiz/presets'],
    [{ ...PLAIN, editors: { outline: { palette: 'x' } } }, '/blocks/quiz/editors/outline'],
    [{ ...PLAIN, editors: { Outline: {} } }, '/blocks/quiz/editors/Outline'],
    [withField(0, { role: 'title' }), '/blocks/quiz/fields/0/role'],
    [withField(0, { help: { en: '' } }), '/blocks/quiz/fields/0/help'],
    [withField(0, { format: 'Custom' }), '/blocks/quiz/fields/0/format'],
    [withField(0, { idValues: {} }), '/blocks/quiz/fields/0/idValues'],
    [withField(1, { idValues: { '1x': {} } }), '/blocks/quiz/fields/1/idValues/1x'],
    [withField(1, { idValues: { left: { colour: 'red' } } }), '/blocks/quiz/fields/1/idValues/left'],
    [withField(1, { idValues: { left: { exclusive: 'yes' } } }), '/blocks/quiz/fields/1/idValues/left/exclusive'],
    [withField(1, { idValues: { left: { alias: { many: 'l' } } } }), '/blocks/quiz/fields/1/idValues/left/alias'],
    [withField(2, { itemQuoteLabel: { en: 'Why' } }), '/blocks/quiz/fields/2/itemQuoteLabel'],
    [{ ...PLAIN, fields: [PLAIN.fields[0], noQuote] }, '/blocks/quiz/fields/1/itemQuoteLabel'],
  ];
  for (const [definition, pointer] of cases) {
    const parsed = pack({ quiz: JSON.parse(JSON.stringify(definition)) });
    assert.equal(parsed.pack, null, pointer);
    assert.deepEqual(pointersOf(parsed.issues), [pointer], JSON.stringify(definition).slice(0, 200));
  }
  const badFormat = { name: 'id', pattern: '^[a-z]+$', format: 'Scene' };
  const argument = pack({ scene: { argument: badFormat, fields: [{ name: 'text', type: 'text' }] } });
  assert.deepEqual(pointersOf(argument.issues), ['/blocks/scene/argument/format']);
});

test('the schema describes every authoring key (block, field, argument)', () => {
  const schema = blockDefinitionSchema();
  const blockKeys = ['description', 'keywords', 'group', 'icon', 'view', 'presets', 'editors'];
  for (const key of blockKeys) assert.ok(schema.properties[key], key);
  const argumentKeys = schema.properties.argument.properties;
  for (const key of ['help', 'placeholder', 'format']) assert.ok(argumentKeys[key], `argument ${key}`);
  const variants = schema.properties.fields.items.oneOf;
  const choices = variants.find((variant) => variant.properties.type.const === 'choices');
  const choicesKeys = ['help', 'add_label', 'placeholder', 'role', 'format', 'idValues', 'itemQuoteLabel'];
  for (const key of choicesKeys) assert.ok(choices.properties[key], `choices ${key}`);
  const text = variants.find((variant) => variant.properties.type.const === 'text');
  assert.equal(text.properties.idValues, undefined, 'idValues only on choices');
});

const encode = (text) => new TextEncoder().encode(text);

/** The check of a code release of one quiz block with `definition`, its examples and an optional editor.json. */
async function release(definition, { examples = null, editor = null } = {}) {
  const files = new Map([
    ['scripts/components.js', encode('export {};\n')],
    ['styles/styles.css', encode('')],
    ['components/quiz/quiz.json', encode(JSON.stringify(definition))],
  ]);
  if (examples !== null) files.set('components/quiz/quiz.example.md', encode(examples));
  if (editor !== null) {
    files.set('components/editor.json', encode(typeof editor === 'string' ? editor : JSON.stringify(editor)));
  }
  return checkCodeRelease(files, { htmlContract: 2 });
}

/** The errors of a checked release as lines `CODE file<pointer>: message`, the form the engine reported. */
function problemsOf({ diagnostics }) {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  return errors.map((d) => `${d.code} ${d.file}${d.field ?? ''}: ${d.message}`);
}

const problemText = (checked) => problemsOf(checked).join('\n');

const EXAMPLES = [
  '<!-- example: Basic {#basic} -->\n\n',
  ':::quiz\n\n### Which one?\n\n- [ ] A {#left}\n- [x] B {#b}\n\n:::\n',
].join('');
const EDITOR = {
  groups: [{ id: 'questions', label: { en: 'Questions' }, icon: 'quiz' }],
  section: { label: { en: 'Section' } },
  icons: 'components/editor-icons',
};

test('a code release accepts the authoring keys and captures editor.json as a code file', async () => {
  const checked = await release(AUTHORED, { examples: EXAMPLES, editor: EDITOR });
  assert.deepEqual(problemsOf(checked), []);
  const block = checked.siteCode.pack.blocks.get('quiz');
  assert.deepEqual(block.authoring.presets, ['basic']);
  const none = block.authoring.fields.options.idValues.none;
  assert.deepEqual(none, { label: { en: 'None of them' }, icon: undefined, exclusive: true, alias: undefined });
  assert.ok(checked.captured.includes('components/editor.json'), 'editor.json is released with the code');
});

test('presets must be usable examples of the block; a group must be one of editor.json\'s', async () => {
  const unknown = await release({ ...AUTHORED, group: undefined, presets: ['missing'] }, { examples: EXAMPLES });
  const notAnExample = /BLOCK_PRESET_UNKNOWN components\/quiz\/quiz\.json\/presets\/0: "missing" is not an example of /;
  assert.match(problemText(unknown), new RegExp(`${notAnExample.source}components\\/quiz\\/quiz\\.example\\.md`));
  const noFile = await release({ ...AUTHORED, group: undefined });
  assert.match(problemText(noFile), /BLOCK_PRESET_UNKNOWN components\/quiz\/quiz\.json\/presets\/0: "basic"/);
  const group = await release({ ...AUTHORED, group: 'media' }, { examples: EXAMPLES, editor: EDITOR });
  const unknownGroup = [
    'EDITOR_CONFIG_INVALID components/quiz/quiz.json/group:',
    'The group "media" is not in the groups of components/editor.json',
  ].join(' ');
  assert.ok(problemText(group).includes(unknownGroup), problemText(group));
  const withoutEditor = await release(AUTHORED, { examples: EXAMPLES });
  assert.deepEqual(problemsOf(withoutEditor), [], 'without editor.json a group is not checked against it');
});

test('components/editor.json: groups, section label and icons folder are checked', async () => {
  assert.deepEqual(parseEditorConfig(JSON.stringify(EDITOR)).problems, []);
  const cases = [
    ['{', ''],
    ['[]', ''],
    [JSON.stringify({ palette: [] }), '/palette'],
    [JSON.stringify({ groups: {} }), '/groups'],
    [JSON.stringify({ groups: [{ id: 'Q' }] }), '/groups/0/id'],
    [JSON.stringify({ groups: [{ id: 'q' }, { id: 'q' }] }), '/groups/1/id'],
    [JSON.stringify({ groups: [{ id: 'q', label: 'Q' }] }), '/groups/0/label'],
    [JSON.stringify({ groups: [{ id: 'q', colour: 'red' }] }), '/groups/0'],
    [JSON.stringify({ section: { title: 'S' } }), '/section'],
    [JSON.stringify({ icons: '../icons' }), '/icons'],
    [JSON.stringify({ icons: 'components/../scripts' }), '/icons'],
    [JSON.stringify({ icons: 'styles/icons' }), '/icons'],
  ];
  for (const [text, pointer] of cases) assert.deepEqual(pointersOf(parseEditorConfig(text).problems), [pointer], text);
  const invalid = await release(AUTHORED, { examples: EXAMPLES, editor: '{"groups": 1}' });
  assert.match(problemText(invalid), /EDITOR_CONFIG_INVALID components\/editor\.json\/groups/);
});

test('lengths are counted in code points, as JSON Schema maxLength counts them', () => {
  const withHelp = (help) => {
    const fields = [{ ...PLAIN.fields[0], help: { en: help } }, ...PLAIN.fields.slice(1)];
    return pack({ quiz: { ...PLAIN, fields } });
  };
  const emoji = '\u{1F600}';
  assert.deepEqual(withHelp(emoji.repeat(600)).issues, [], '600 code points (1200 UTF-16 units) fit 1024');
  assert.deepEqual(withHelp(emoji.repeat(1024)).issues, []);
  assert.deepEqual(pointersOf(withHelp(emoji.repeat(1025)).issues), ['/blocks/quiz/fields/0/help']);
  const words = (word) => pack({ quiz: { ...PLAIN, keywords: { en: [word] } } });
  assert.deepEqual(words(emoji.repeat(64)).issues, []);
  assert.deepEqual(pointersOf(words(emoji.repeat(65)).issues), ['/blocks/quiz/keywords']);
  const description = (text) => pack({ quiz: { ...PLAIN, description: { en: text } } });
  assert.deepEqual(description(emoji.repeat(4096)).issues, []);
  assert.deepEqual(pointersOf(description(emoji.repeat(4097)).issues), ['/blocks/quiz/description']);
});

test('editor.json without groups (omitted) is fine everywhere; null groups are a problem, not a crash', async () => {
  const ungrouped = { ...AUTHORED, group: undefined };
  for (const editor of [{}, { icons: 'components/editor-icons' }, { section: { label: { en: 'Part' } } }]) {
    const parsed = parseEditorConfig(JSON.stringify(editor));
    assert.deepEqual(parsed.problems, [], JSON.stringify(editor));
    assert.deepEqual(parsed.config.groups, [], 'omitted groups are an empty list');
    const checked = await release(ungrouped, { examples: EXAMPLES, editor });
    assert.deepEqual(problemsOf(checked), [], JSON.stringify(editor));
  }
  assert.deepEqual(pointersOf(parseEditorConfig('{"groups": null}').problems), ['/groups']);
  const withNull = await release(ungrouped, { examples: EXAMPLES, editor: '{"groups": null}' });
  const notAList = /EDITOR_CONFIG_INVALID components\/editor\.json\/groups: "groups" must be a list/;
  assert.match(problemText(withNull), notAList);
  const grouped = await release(AUTHORED, { examples: EXAMPLES, editor: { icons: 'components/editor-icons' } });
  assert.match(
    problemText(grouped),
    /EDITOR_CONFIG_INVALID components\/quiz\/quiz\.json\/group: The group "questions" is not in the groups/,
    'no groups: a named group is unknown',
  );
});

test('a preset must be a well-formed example: one with a structural problem is BLOCK_PRESET_UNKNOWN', async () => {
  const empty = '<!-- example: Basic {#basic} -->\n';
  const checked = await release({ ...AUTHORED, group: undefined }, { examples: empty });
  const problems = problemText(checked);
  assert.match(problems, /BLOCK_PRESET_UNKNOWN components\/quiz\/quiz\.json\/presets\/0: "basic" is not an example/);
  const preset = checked.diagnostics.find((d) => d.code === 'BLOCK_PRESET_UNKNOWN');
  assert.deepEqual([preset.component, preset.field], ['quiz', '/presets/0']);
  // As in the engine, examples are checked once the block definitions have no errors.
  const unpreset = await release({ ...AUTHORED, group: undefined, presets: undefined }, { examples: empty });
  assert.match(problemText(unpreset), /^EXAMPLE_EMPTY components\/quiz\/quiz\.example\.md: /);
});
