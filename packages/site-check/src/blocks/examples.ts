// Block examples: `components/<name>/<name>.example.md`, plain Markdown an author can read. Each example starts
// with a marker line, an HTML comment, so the block content itself may use any heading level:
//
//   # Note                                  ← optional; text before the first marker is the intro
//   <!-- example: Short note -->            ← one example, titled by the marker
//   :::note
//   …
//   :::
//   <!-- example: With a title {#titled} -->  ← `{#id}` names the example; else a slug of the title
//
// Everything after a marker (up to the next one) is one example: the engine renders it like a page of the
// site, so it may hold several blocks, prose and headings of any level. A file without markers is one
// example, "Example". The marker is a root-level line of its own (the file is parsed: a marker inside fenced
// code does not split), so a block whose field is a `##` heading can still have examples.

import type { Html, Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export { exampleFileOf, isExampleFile } from '../formats/layout.js';

export interface ExampleSource {
  /** unique in the file: `{#id}` of the heading, else a slug of its title */
  id: string;
  title: string;
  /** the Markdown under the heading */
  markdown: string;
  /** line of the file where `markdown` starts (1-based) */
  line: number;
  /** problems of this example's heading or content: such an example is not rendered */
  problems: ExampleProblem[];
}

export interface ExampleProblem {
  code: 'EXAMPLE_ID_DUPLICATE' | 'EXAMPLE_ID_INVALID' | 'EXAMPLE_EMPTY';
  line: number;
  message: string;
}

export interface ExampleFile {
  /** Markdown before the first marker (empty when none) and its first line */
  intro: string;
  introLine: number;
  examples: ExampleSource[];
  /** problems of the file as a whole (an empty file) */
  problems: ExampleProblem[];
}

/** `<!-- example: Title {#id} -->` alone on its line (trailing blanks allowed; the title never contains `-->`). */
const MARKER = /^<!--[ \t]*example:[ \t]*((?:(?!-->).)*?)[ \t]*-->[ \t]*$/;
const ID_SUFFIX = /(?:^|[ \t]+)\{#([^{}]*)\}[ \t]*$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;

function slug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

/** The id of a heading without `{#id}`: its slug when that is a valid id, else a valid id made from it. */
function slugId(title: string, position: number): string {
  const made = slug(title);
  if (ID.test(made)) return made;
  return made === '' ? `example-${position}` : `example-${made}`.slice(0, 64).replace(/-+$/, '');
}

/** Whether `id` is a valid example id (lowercase letters, digits and "-", starting with a letter). */
export function isExampleId(id: string): boolean {
  return ID.test(id);
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Splits an example file into its intro and examples. */
export function parseExampleFile(text: string): ExampleFile {
  const tree = unified().use(remarkParse).parse(text) as Root;
  const markers = tree.children.filter(
    (node): node is Html => node.type === 'html' && node.position!.start.column === 1 && MARKER.test(node.value),
  );
  const problems: ExampleProblem[] = [];
  if (markers.length === 0) {
    const examples =
      text.trim() === '' ? [] : [{ id: 'example', title: 'Example', markdown: text, line: 1, problems: [] }];
    if (examples.length === 0) problems.push({ code: 'EXAMPLE_EMPTY', line: 1, message: 'The example file is empty.' });
    return { intro: '', introLine: 1, examples, problems };
  }
  const examples: ExampleSource[] = [];
  const seen = new Set<string>();
  markers.forEach((marker, index) => {
    const headingEnd = marker.position!.end.offset!;
    const end = index + 1 < markers.length ? markers[index + 1].position!.start.offset! : text.length;
    const line = marker.position!.start.line;
    let title = MARKER.exec(marker.value)![1].trim();
    let id: string;
    const own: ExampleProblem[] = [];
    const suffix = ID_SUFFIX.exec(title);
    if (suffix) {
      title = title.slice(0, suffix.index).trim();
      id = suffix[1];
      if (!ID.test(id))
        own.push({
          code: 'EXAMPLE_ID_INVALID',
          line,
          message: `Invalid example id {#${id}}: use lowercase letters, digits and "-", starting with a letter.`,
        });
    } else id = slugId(title, index + 1);
    if (title === '') title = `Example ${index + 1}`;
    // The id names rendered files of the engine: an invalid or repeated one is never used.
    if (seen.has(id))
      own.push({
        code: 'EXAMPLE_ID_DUPLICATE',
        line,
        message: `Two examples have the id "${id}"; give one of them its own \`{#id}\`.`,
      });
    seen.add(id);
    const markdown = text.slice(headingEnd, end).replace(/^[^\n]*\n?/, '');
    if (markdown.trim() === '')
      own.push({ code: 'EXAMPLE_EMPTY', line, message: `The example "${title}" has no content under its heading.` });
    examples.push({ id, title, markdown, line: lineAt(text, headingEnd) + 1, problems: own });
  });
  const intro = text.slice(0, markers[0].position!.start.offset!);
  return { intro: intro.trim() === '' ? '' : intro, introLine: 1, examples, problems };
}
