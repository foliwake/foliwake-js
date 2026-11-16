// query.yaml: strict parsing, the bounded glob grammar and matching. Ported from the engine's tests of the same
// rules (behaviour parity); problems are structured ({line, column, field, message}) instead of one string.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  QUERY_LIMITS,
  compileGlob,
  globMatches,
  indexFilter,
  parseQueryConfig,
} from '@foliwake/site-check/formats/query';
import { problemText } from './helpers/site-check.js';

const SPEC_EXAMPLE = `version: 1
indices:
  default:
    include: ["/**"]
    exclude: ["/fragments/**", "/drafts/**"]
    target: /query-index.json
    properties: [title, description, lang]
  lessons:
    include: ["/lessons/**"]
    target: /lessons/query-index.json
    properties: [title, description]
sitemap:
  source: default
`;

const parse = (text) => parseQueryConfig(Buffer.from(text, 'utf8'));
const problemsOf = (text) => {
  const result = parse(text);
  assert.ok(result.problems, `expected problems for:\n${text}`);
  return result.problems.map(problemText).join('\n');
};
const oneIndex = (body) => `version: 1\nindices:\n  a:\n${body}`;

test('the specification example parses into indices in declared order and a sitemap source', () => {
  const { config, problems } = parse(SPEC_EXAMPLE);
  assert.equal(problems, undefined);
  assert.equal(config.schema, 'foliwake-query/1');
  assert.deepEqual(
    config.indices.map((i) => [i.name, i.target, i.properties]),
    [
      ['default', '/query-index.json', ['title', 'description', 'lang']],
      ['lessons', '/lessons/query-index.json', ['title', 'description']],
    ],
  );
  assert.deepEqual(config.indices[1].exclude, []);
  assert.deepEqual(config.sitemap, { source: 'default' });
  assert.equal(parse(SPEC_EXAMPLE.replace(/sitemap:\n {2}source: default\n/, '')).config.sitemap, null);
});

test('schema: version, required keys and unknown keys at every level are refused', () => {
  assert.match(
    problemsOf('indices:\n  a: {include: ["/**"], target: /a.json, properties: []}\n'),
    /`version` is required/,
  );
  assert.match(problemsOf(SPEC_EXAMPLE.replace('version: 1', 'version: 2')), /`version` must be 1/);
  assert.match(problemsOf(SPEC_EXAMPLE.replace('version: 1', 'version: "1"')), /`version` must be 1/);
  assert.match(problemsOf('version: 1\n'), /`indices` is required/);
  assert.match(problemsOf('version: 1\nindices: {}\n'), /non-empty mapping/);
  assert.match(problemsOf(`${SPEC_EXAMPLE}extra: 1\n`), /unknown key "extra"/);
  assert.match(
    problemsOf(
      SPEC_EXAMPLE.replace(
        '    target: /lessons/query-index.json',
        '    target: /lessons/query-index.json\n    selectors: x',
      ),
    ),
    /indices\.lessons: unknown key "selectors"/,
  );
  assert.match(
    problemsOf(SPEC_EXAMPLE.replace('  source: default', '  source: default\n  origin: https://x.org')),
    /sitemap: unknown key "origin"/,
  );
  assert.match(problemsOf(oneIndex('    target: /a.json\n    properties: []\n')), /`include` is required/);
  assert.match(problemsOf(oneIndex('    include: ["/**"]\n    properties: []\n')), /`target` is required/);
  assert.match(problemsOf(oneIndex('    include: ["/**"]\n    target: /a.json\n')), /`properties` is required/);
  assert.match(problemsOf('- a\n'), /must be a mapping/);
  assert.match(problemsOf('version: 1\nindices:\n  a: [1]\n'), /an index must be a mapping/);
  // YAML subset of front matter: duplicate keys, anchors, aliases, tags.
  assert.match(problemsOf(`${SPEC_EXAMPLE}version: 1\n`), /Duplicate key "version"/);
  assert.match(problemsOf(SPEC_EXAMPLE.replace('include: ["/lessons/**"]', 'include: &x ["/lessons/**"]')), /anchors/);
  assert.match(
    problemsOf(SPEC_EXAMPLE.replace('target: /query-index.json', 'target: !!str /query-index.json')),
    /tags/,
  );
  // Positions are reported.
  const [first] = parse(SPEC_EXAMPLE.replace('version: 1', 'version: 2')).problems;
  assert.equal(first.line, 1);
  assert.equal(first.field, 'version');
});

test('index names, targets (normalised, unique, reserved) and properties (built-in, no duplicates, no path)', () => {
  for (const name of ['Default', '1a', 'a_b', 'a.b', 'x'.repeat(QUERY_LIMITS.nameLength + 1)]) {
    assert.match(
      problemsOf(`version: 1\nindices:\n  ${name}: {include: ["/**"], target: /a.json, properties: []}\n`),
      /must match \[a-z\]\[a-z0-9-\]\*/,
      name,
    );
  }
  const target = (t) => oneIndex(`    include: ["/**"]\n    target: ${JSON.stringify(t)}\n    properties: []\n`);
  for (const ok of ['/query-index.json', '/lessons/query-index.json', '/a/b_c/d-e.v1.json', '/a--b.json', '/_x/y.json'])
    assert.ok(parse(target(ok)).config, ok);
  const refused = {
    'query-index.json': /absolute/,
    '/a//b.json': /normalised/,
    '/a/./b.json': /normalised/,
    '/a/../b.json': /normalised/,
    '/a/': /normalised/,
    '/Query.json': /normalised/,
    '/a b.json': /normalised/,
    '/a.JSON': /normalised/,
    '/a.xml': /end in \.json/,
    '/query-index': /end in \.json/,
    '/code/x.json': /reserved prefix \/code\//,
    '/media/x.json': /reserved prefix \/media\//,
    '/_preview/x.json': /reserved prefix \/_preview\//,
    '/.well-known/x.json': /normalised/,
    '/components/x.json': /reserved prefix \/components\//,
    [`/${'a'.repeat(200)}.json`]: /longer than/,
  };
  for (const [t, pattern] of Object.entries(refused)) assert.match(problemsOf(target(t)), pattern, t);
  assert.match(
    problemsOf(
      'version: 1\nindices:\n' +
        '  a: {include: ["/**"], target: /x.json, properties: []}\n' +
        '  b: {include: ["/**"], target: /x.json, properties: []}\n',
    ),
    /already the target of index "a"/,
  );
  const props = (list) => oneIndex(`    include: ["/**"]\n    target: /a.json\n    properties: ${list}\n`);
  assert.deepEqual(parse(props('[]')).config.indices[0].properties, []);
  assert.deepEqual(parse(props('[lang, id]')).config.indices[0].properties, ['lang', 'id']);
  assert.match(problemsOf(props('[title, title]')), /"title" is listed twice/);
  assert.match(problemsOf(props('[path]')), /`path` is always the first column/);
  assert.deepEqual(parse(props('[title, country, subtopics, first_image]')).config.indices[0].properties, [
    'title',
    'country',
    'subtopics',
    'first_image',
  ]);
  assert.match(
    problemsOf(props('[firstImage]')),
    /property "firstImage" is not a property name; use a built-in property/,
  );
  assert.match(problemsOf(props('[sub-topic]')), /property "sub-topic" is not a property name/);
  assert.match(problemsOf(props(`[a${'b'.repeat(32)}]`)), /is not a property name/);
  assert.match(problemsOf(props('[42]')), /property "a number" is not a property name/);
  for (const key of ['template', 'authoring'])
    assert.match(problemsOf(props(`[${key}]`)), new RegExp(`"${key}" is a front matter key the index cannot list`));
  assert.match(problemsOf(props('title')), /must be a list/);
  assert.match(problemsOf(props(`[${Array(11).fill('title').join(', ')}]`)), /at most 10/);
});

test('encoding: strict UTF-8 (a U+FFFD character in a comment is valid; malformed bytes are not)', () => {
  assert.ok(parse(`# \uFFFD replacement character\n${SPEC_EXAMPLE}`).config);
  const malformed = Buffer.concat([Buffer.from('# '), Buffer.from([0xc3, 0x28]), Buffer.from(`\n${SPEC_EXAMPLE}`)]);
  assert.match(parseQueryConfig(malformed).problems.map(problemText).join('\n'), /not valid UTF-8/);
});

test('sitemap.source must name a declared index', () => {
  assert.match(
    problemsOf(SPEC_EXAMPLE.replace('source: default', 'source: nope')),
    /names index "nope", which is not declared/,
  );
  assert.match(problemsOf(SPEC_EXAMPLE.replace('  source: default\n', '')), /`sitemap` must be a mapping/);
  assert.match(problemsOf(SPEC_EXAMPLE.replace('  source: default\n', '  {}\n')), /`sitemap.source` is required/);
  assert.match(problemsOf(SPEC_EXAMPLE.replace('source: default', 'source: [default]')), /must be an index name/);
});

test('limits: file size, index count, globs per list and glob length', () => {
  assert.match(problemsOf(`${SPEC_EXAMPLE}#${'x'.repeat(QUERY_LIMITS.fileBytes)}\n`), /at most 65536 are allowed/);
  const many = Array.from(
    { length: 11 },
    (_, i) => `  i${i}: {include: ["/**"], target: /i${i}.json, properties: []}`,
  ).join('\n');
  assert.match(problemsOf(`version: 1\nindices:\n${many}\n`), /11 indexes are declared; at most 10/);
  const globs = JSON.stringify(Array.from({ length: 21 }, (_, i) => `/a${i}`));
  assert.match(
    problemsOf(oneIndex(`    include: ${globs}\n    target: /a.json\n    properties: []\n`)),
    /21 globs are listed; at most 20/,
  );
  assert.match(
    problemsOf(oneIndex(`    include: ["/${'a'.repeat(200)}"]\n    target: /a.json\n    properties: []\n`)),
    /longer than 200/,
  );
  assert.match(problemsOf(oneIndex('    include: []\n    target: /a.json\n    properties: []\n')), /non-empty list/);
  assert.match(
    problemsOf(oneIndex('    include: ["/**"]\n    exclude: []\n    target: /a.json\n    properties: []\n')),
    /non-empty list/,
  );
});

test('glob grammar: segments of [a-z0-9_-] and *, ** only as a whole segment; nothing else', () => {
  const glob = (g) => oneIndex(`    include: [${JSON.stringify(g)}]\n    target: /a.json\n    properties: []\n`);
  for (const ok of [
    '/',
    '/**',
    '/a/**',
    '/a/*/b',
    '/lesson-*',
    '/*-x-*',
    '/**/b',
    '/a/**/b/**',
    '/foundation_control/**',
    '/*_signals',
  ]) {
    assert.ok(parse(glob(ok)).config, ok);
  }
  for (const bad of [
    'a/**',
    '/a/',
    '/a//b',
    '/a**',
    '/**b',
    '/***',
    '/{a,b}',
    '/[ab]',
    '/!a',
    '/a\\*',
    '/A',
    '/a.b',
    '/?',
    '/a b',
    '',
  ]) {
    assert.ok(parse(glob(bad)).problems, bad);
  }
  assert.match(problemsOf(glob('/a**')), /\*\* inside a segment/);
});

test('matching: an include and no exclude; /x/** also matches /x; * stays within a segment', () => {
  const m = (g, p) => globMatches(compileGlob(g), p);
  assert.ok(m('/**', '/'));
  assert.ok(m('/**', '/a/b/c'));
  assert.ok(m('/', '/'));
  assert.ok(!m('/', '/a'));
  assert.ok(m('/lessons/**', '/lessons'));
  assert.ok(m('/lessons/**', '/lessons/a/b'));
  assert.ok(!m('/lessons/**', '/lessons-old'));
  assert.ok(!m('/lessons/**', '/'));
  assert.ok(m('/lessons/*', '/lessons/a'));
  assert.ok(!m('/lessons/*', '/lessons'));
  assert.ok(!m('/lessons/*', '/lessons/a/b'));
  assert.ok(m('/lesson-*', '/lesson-1'));
  assert.ok(m('/lesson-*', '/lesson-')); // * may be empty
  assert.ok(!m('/lesson-*', '/lessons'));
  assert.ok(m('/*-x-*', '/a-x-b'));
  assert.ok(m('/*-x-*', '/-x-'));
  assert.ok(!m('/*-x-*', '/a-x'));
  assert.ok(m('/a*b*c', '/abc'));
  assert.ok(m('/a*b*c', '/axxbyyc'));
  assert.ok(!m('/a*b*c', '/acb'));
  assert.ok(!m('/ab*ba', '/aba')); // overlapping prefix/suffix must not double count
  assert.ok(m('/**/b', '/b'));
  assert.ok(m('/**/b', '/a/x/b'));
  assert.ok(!m('/**/b', '/a/b/c'));
  assert.ok(m('/a/**/b/**', '/a/b'));
  assert.ok(m('/a/**/b/**', '/a/x/b/y/z'));
  const inIndex = indexFilter({ include: ['/**'], exclude: ['/fragments/**', '/drafts/**'] });
  assert.ok(inIndex('/'));
  assert.ok(inIndex('/lessons/a'));
  assert.ok(!inIndex('/fragments'));
  assert.ok(!inIndex('/fragments/nav'));
  assert.ok(!inIndex('/drafts/x/y'));
  assert.ok(inIndex('/fragments-old'));
});

test('pathological globs stay within the matching bound', () => {
  // 100 segments of `**` against a 200-segment path that never matches the final literal: the
  // memoised walk compares at most 100 × 201 positions instead of exploring every split.
  const pattern = `/${Array(99).fill('**').join('/')}/z`;
  assert.ok(pattern.length <= 300);
  const deep = `/${Array(200).fill('a').join('/')}`;
  const started = process.hrtime.bigint();
  assert.equal(globMatches(compileGlob(pattern), deep), false);
  const star = compileGlob(`/${Array(60).fill('*').join('a')}b`);
  assert.equal(globMatches(star, `/${'a'.repeat(100)}`), false);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 200, `bounded matching took ${ms} ms`);
});
