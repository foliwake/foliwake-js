// A strict htmlparser2 reader for Foliwake bodies (ported from Gaiare's lib/foliwake-lessons/html-fragment.ts):
// bodies are serialiser output, so anything the parser would have to REPAIR is an error (fail closed):
// an implied end or start tag, an end tag with nothing to close, a tag or comment cut off by the end of
// the document, an attribute given twice. Void elements and `/>` are the only closings without an end tag.
// Entities are decoded (text and attribute values), as a browser does.
import { Parser } from 'htmlparser2';
import { LIMITS } from './constants.js';

export type HtmlText = { type: 'text'; data: string };
export type HtmlElement = { type: 'tag'; name: string; attribs: Record<string, string>; children: HtmlNode[] };
export type HtmlNode = HtmlText | HtmlElement;

export class HtmlParseError extends Error {
  override name = 'HtmlParseError';
}

export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

class StrictParser extends Parser {
  selfClosing = false;
  closed = 0;
  inStartTag = false;
  override onopentagname(start: number, endIndex: number) {
    this.inStartTag = true;
    super.onopentagname(start, endIndex);
  }
  override onopentagend(endIndex: number) {
    this.inStartTag = false;
    super.onopentagend(endIndex);
  }
  override onselfclosingtag(endIndex: number) {
    this.inStartTag = false;
    this.selfClosing = true;
    super.onselfclosingtag(endIndex);
    this.selfClosing = false;
  }
  override oncomment(start: number, endIndex: number, offset: number) {
    if (offset === 0) throw new HtmlParseError('unterminated comment');
    super.oncomment(start, endIndex, offset);
  }
  override onclosetag(start: number, endIndex: number) {
    const before = this.closed;
    super.onclosetag(start, endIndex);
    if (this.closed === before) throw new HtmlParseError('an end tag without a start tag');
  }
}

/** Parses a body strictly. Comments are dropped; a doctype or processing instruction is an error. */
export function parseStrict(html: string): HtmlNode[] {
  if (html.length > LIMITS.body) throw new HtmlParseError('document too large');
  const root: HtmlElement = { type: 'tag', name: '#root', attribs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const top = () => stack[stack.length - 1]!;
  let openText: HtmlText | null = null;
  let attributes = new Set<string>();
  const parser: StrictParser = new StrictParser(
    {
      onopentagname() {
        attributes = new Set();
      },
      onattribute(name) {
        if (attributes.has(name)) throw new HtmlParseError(`attribute ${name} given twice`);
        attributes.add(name);
      },
      onopentag(name, attribs, isImplied) {
        if (isImplied) throw new HtmlParseError(`</${name}> without <${name}>`);
        openText = null;
        const element: HtmlElement = { type: 'tag', name, attribs, children: [] };
        top().children.push(element);
        if (stack.length > LIMITS.depth) throw new HtmlParseError('nested too deeply');
        stack.push(element);
      },
      onclosetag(name, isImplied) {
        if (isImplied && !VOID.has(name) && !parser.selfClosing) throw new HtmlParseError(`unclosed <${name}>`);
        if (!isImplied) parser.closed += 1;
        openText = null;
        stack.pop();
      },
      ontext(data) {
        if (openText) {
          openText.data += data;
          return;
        }
        openText = { type: 'text', data };
        top().children.push(openText);
      },
      oncomment() {
        openText = null;
      },
      onprocessinginstruction(name) {
        throw new HtmlParseError(`<${name.slice(0, 20)}> is not allowed in a body`);
      },
    },
    { recognizeSelfClosing: true },
  );
  parser.write(html);
  parser.end();
  if (parser.inStartTag) throw new HtmlParseError('unterminated start tag');
  if (/<[/!?][^>]*$/.test(html)) throw new HtmlParseError('unterminated tag at the end of the document');
  return root.children;
}

const RAW_NEWLINE = new Set(['pre', 'textarea', 'listing']);
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/ /g, '&nbsp;');

/** Serialises the tree as HTML (the WHATWG fragment serialisation rules for the elements a body may hold). */
export function serialize(nodes: readonly HtmlNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += escapeText(node.data);
      continue;
    }
    out += `<${node.name}`;
    for (const [name, value] of Object.entries(node.attribs)) out += ` ${name}="${escapeAttr(value)}"`;
    out += '>';
    if (VOID.has(node.name)) continue;
    const first = node.children[0];
    if (RAW_NEWLINE.has(node.name) && first?.type === 'text' && first.data.startsWith('\n')) out += '\n';
    out += serialize(node.children);
    out += `</${node.name}>`;
  }
  return out;
}

/** Every element below `nodes`, depth first. */
export function* elements(nodes: readonly HtmlNode[]): Generator<HtmlElement> {
  for (const node of nodes) {
    if (node.type !== 'tag') continue;
    yield node;
    yield* elements(node.children);
  }
}
