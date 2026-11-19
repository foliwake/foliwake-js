// The title of a prepared body: the text of its first <h1>, whitespace collapsed, at most 200 characters.
import { elements, type HtmlNode } from './html.js';

const MAX_TITLE = 200;

function textOf(nodes: readonly HtmlNode[]): string {
  return nodes.map((node) => (node.type === 'text' ? node.data : textOf(node.children))).join('');
}

/** The first `<h1>`'s text, or null when there is none or it is empty. */
export function firstHeading(nodes: readonly HtmlNode[]): string | null {
  for (const element of elements(nodes)) {
    if (element.name !== 'h1') continue;
    const text = textOf(element.children).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
    return text === '' ? null : text;
  }
  return null;
}
