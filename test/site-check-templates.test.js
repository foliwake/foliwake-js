// The template definition rules and page rules (ported from the engine's tests).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  entryTemplateProblems,
  pageTemplate,
  parseTemplateDefinition,
  parseTemplateRegistry,
  templateBlockProblems,
  templatePathProblem,
} from '@foliwake/site-check/formats/templates';

const LESSON = { label: 'Lesson', paths: ['/lessons/**'], blocks: ['scene', 'note'], css: true, js: false };
const FREE = { label: 'Free', paths: ['/free'], css: false, js: false };
const LOCKED = { label: 'Locked', paths: ['/locked'], blocks: [], css: false, js: false };
const REGISTRY = { schema: 'foliwake-templates/1', templates: { lesson: LESSON, free: FREE, locked: LOCKED } };

function problemsOf(value) {
  return parseTemplateDefinition(value).problems;
}

test('a definition has a label, optional paths and optional blocks', () => {
  const { definition, problems } = parseTemplateDefinition({
    label: 'Lesson',
    paths: ['/lessons/**'],
    blocks: ['scene'],
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(definition, { label: 'Lesson', paths: ['/lessons/**'], blocks: ['scene'] });
  assert.deepEqual(parseTemplateDefinition({ label: 'L', paths: ['/'] }).definition, { label: 'L', paths: ['/'] });
  assert.deepEqual(parseTemplateDefinition({ label: 'L', paths: ['/'], blocks: [] }).definition, {
    label: 'L',
    paths: ['/'],
    blocks: [],
  });
  assert.deepEqual(parseTemplateDefinition({ label: 'L' }).definition, { label: 'L' }, 'no paths: any path');
});

test('fields are typed and unknown keys are rejected', () => {
  const invalid = [
    null,
    [],
    'lesson',
    { paths: ['/x'] },
    { label: '', paths: ['/x'] },
    { label: 3, paths: ['/x'] },
    { label: 'L', paths: '/x' },
    { label: 'L', paths: [] },
    { label: 'L', paths: [7] },
    { label: 'L', paths: ['/x'], blocks: 'scene' },
    { label: 'L', paths: ['/x'], blocks: [1] },
    { label: 'L', paths: ['/x'], extra: true },
  ];
  for (const value of invalid) {
    assert.ok(problemsOf(value).length > 0, JSON.stringify(value));
    assert.equal(parseTemplateDefinition(value).definition, null);
  }
});

test('paths go through the query glob validator', () => {
  assert.match(problemsOf({ label: 'L', paths: ['lessons'] })[0], /lessons.*must start with \//);
  assert.match(problemsOf({ label: 'L', paths: ['/a//b'] })[0], /empty segment/);
  assert.match(problemsOf({ label: 'L', paths: ['/A'] })[0], /may only use/);
});

test('a stored registry must have the schema and every asset flag', () => {
  assert.deepEqual(parseTemplateRegistry(JSON.stringify(REGISTRY)), { registry: REGISTRY, problems: [] });
  const invalid = [
    'not json',
    '[]',
    JSON.stringify({ templates: {} }),
    JSON.stringify({ schema: 'foliwake-templates/1' }),
    JSON.stringify({ schema: 'foliwake-templates/1', templates: { lesson: { label: 'L', paths: ['/x'] } } }),
    JSON.stringify({ schema: 'foliwake-templates/1', templates: { Lesson: LESSON } }),
    JSON.stringify({ schema: 'foliwake-templates/1', templates: {}, more: 1 }),
  ];
  for (const text of invalid) {
    const { registry, problems } = parseTemplateRegistry(text);
    assert.equal(registry, null, text);
    assert.ok(problems.length > 0, text);
  }
});

test('TEMPLATE_UNKNOWN: the registry has no such template, or there is no registry', () => {
  assert.equal(templatePathProblem({ path: '/x', template: 'ghost' }, REGISTRY).code, 'TEMPLATE_UNKNOWN');
  assert.equal(templatePathProblem({ path: '/x', template: 'lesson' }, null).code, 'TEMPLATE_UNKNOWN');
  assert.equal(templatePathProblem({ path: '/x', template: 'constructor' }, REGISTRY).code, 'TEMPLATE_UNKNOWN');
});

test('TEMPLATE_PATH: the page path does not match the paths of its template; no paths, no guard', () => {
  assert.equal(templatePathProblem({ path: '/about', template: 'lesson' }, REGISTRY).code, 'TEMPLATE_PATH');
  const open = { schema: 'foliwake-templates/1', templates: { any: { label: 'Any', css: false, js: false } } };
  assert.equal(templatePathProblem({ path: '/about', template: 'any' }, open), null);
  assert.equal(templatePathProblem({ path: '/lessons/one', template: 'lesson' }, REGISTRY), null);
  assert.equal(templatePathProblem({ path: '/lessons', template: 'lesson' }, REGISTRY), null, '/x/** also matches /x');
});

test('only the page chooses its template: a page that names none has no template problem, on any path', () => {
  const both = {
    schema: 'foliwake-templates/1',
    templates: { a: { ...FREE, paths: ['/x/**'] }, b: { ...FREE, paths: ['/x/*'] } },
  };
  assert.equal(templatePathProblem({ path: '/x/y', template: 'a' }, both), null);
  assert.equal(templatePathProblem({ path: '/x/y', template: 'b' }, both), null);
  assert.equal(templatePathProblem({ path: '/x/y', template: null }, both), null);
  assert.equal(templatePathProblem({ path: '/lessons/one', template: null }, REGISTRY), null);
});

test('TEMPLATE_BLOCK: blocks absent allows all, an empty list allows none', () => {
  assert.deepEqual(templateBlockProblems('free', ['anything'], REGISTRY), []);
  assert.deepEqual(templateBlockProblems('lesson', ['scene', 'note'], REGISTRY), []);
  assert.deepEqual(
    templateBlockProblems('lesson', ['hero', 'scene'], REGISTRY).map((p) => [p.code, p.block]),
    [['TEMPLATE_BLOCK', 'hero']],
  );
  assert.deepEqual(
    templateBlockProblems('locked', ['scene'], REGISTRY).map((p) => p.code),
    ['TEMPLATE_BLOCK'],
  );
  assert.deepEqual(
    templateBlockProblems('ghost', ['scene'], REGISTRY),
    [],
    'an unknown template is TEMPLATE_UNKNOWN only',
  );
  assert.deepEqual(templateBlockProblems(null, ['scene'], REGISTRY), []);
});

test('a release entry is judged by its recorded template and metadata.blocks names', () => {
  const entry = (metadata) => ({
    page_id: 'p',
    metadata: { title: 'T', description: null, components: [], ...metadata },
  });
  assert.deepEqual(entryTemplateProblems('/about', entry({}), REGISTRY), []);
  assert.deepEqual(entryTemplateProblems('/lessons/a', entry({}), REGISTRY), []);
  assert.deepEqual(
    entryTemplateProblems('/a', entry({ template: 'ghost' }), REGISTRY).map((p) => p.code),
    ['TEMPLATE_UNKNOWN'],
  );
  assert.deepEqual(
    entryTemplateProblems('/a', entry({ template: 'lesson' }), REGISTRY).map((p) => p.code),
    ['TEMPLATE_PATH'],
  );
  assert.deepEqual(
    entryTemplateProblems('/lessons/a', entry({ template: 'lesson', blocks: { hero: 'sig' } }), REGISTRY).map(
      (p) => p.code,
    ),
    ['TEMPLATE_BLOCK'],
  );
  assert.deepEqual(
    entryTemplateProblems('/lessons/a', entry({ template: 'lesson', blocks: { scene: 'sig' } }), REGISTRY),
    [],
  );
});

test('pageTemplate: only a declared template with a safe name; malformed registries give none', () => {
  assert.deepEqual(pageTemplate('lesson', REGISTRY), { name: 'lesson', css: true, js: false });
  assert.equal(pageTemplate(undefined, REGISTRY), null);
  assert.equal(pageTemplate('ghost', REGISTRY), null);
  assert.equal(pageTemplate('constructor', REGISTRY), null);
  for (const registry of [null, undefined, 'x', 1, [], {}, { templates: null }, { templates: { lesson: true } }]) {
    assert.equal(pageTemplate('lesson', registry), null, JSON.stringify(registry));
  }
  const unsafe = { templates: { 'x"><b>': { css: true, js: true } } };
  assert.equal(pageTemplate('x"><b>', unsafe), null);
  assert.deepEqual(pageTemplate('lesson', { templates: { lesson: { css: 'yes', js: 1 } } }), {
    name: 'lesson',
    css: false,
    js: false,
  });
});
