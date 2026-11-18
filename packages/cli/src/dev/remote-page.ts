// `foliwake dev --remote`: the content kept from a deployed page (parse5; only the children of <main>,
// <title>, <meta name="description">, <html lang> and <html data-html-contract>), and whether the local
// frontend can render it.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { HTML_CONTRACT } from '@foliwake/site-check/formats/constants';
import { DESCRIPTOR_PATH } from '@foliwake/site-check/formats/descriptor';
import type { Diagnostic } from '@foliwake/site-check/formats/diagnostics';

import { toProblem } from './dev-checks.js';
import type { DevProblem } from './dev-reload.js';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

/** The content kept from a remote page. */
export interface RemotePage {
  lang: string | null;
  htmlContract: string | null;
  title: string;
  description: string | null;
  /** The children of <main>, serialized. */
  body: string;
  /** data-component values used in <main>, in document order, without duplicates. */
  components: string[];
}

function isElement(node: Node): node is Element {
  return 'tagName' in node;
}

function attr(element: Element, name: string): string | null {
  return element.attrs.find((a) => a.name === name)?.value ?? null;
}

function children(node: Node): Node[] {
  const own = 'childNodes' in node ? (node as ParentNode).childNodes : [];
  // <template> content is a separate fragment.
  return isElement(node) && node.tagName === 'template' && 'content' in node
    ? [...own, ...(node as DefaultTreeAdapterMap['template']).content.childNodes]
    : own;
}

function find(node: Node, predicate: (element: Element) => boolean): Element | null {
  for (const child of children(node)) {
    if (isElement(child) && predicate(child)) return child;
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

function walk(node: Node, visit: (element: Element) => void): void {
  for (const child of children(node)) {
    if (isElement(child)) visit(child);
    walk(child, visit);
  }
}

function textOf(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  return children(node).map(textOf).join('');
}

/** Extracts the content of a deployed page; null when the document has no <main>. */
export function extractRemotePage(html: string): RemotePage | null {
  const document = parse(html);
  const root = document.childNodes.find((n): n is Element => isElement(n) && n.tagName === 'html');
  if (!root) return null;
  const head = root.childNodes.find((n): n is Element => isElement(n) && n.tagName === 'head');
  const body = root.childNodes.find((n): n is Element => isElement(n) && n.tagName === 'body');
  const main = body ? find(body, (e) => e.tagName === 'main') : null;
  if (!main) return null;
  const title = head ? find(head, (e) => e.tagName === 'title') : null;
  const meta = head
    ? find(head, (e) => e.tagName === 'meta' && (attr(e, 'name') ?? '').toLowerCase() === 'description')
    : null;
  const components: string[] = [];
  walk(main, (element) => {
    const name = attr(element, 'data-component')?.trim();
    if (name && !components.includes(name)) components.push(name);
  });
  return {
    lang: attr(root, 'lang'),
    htmlContract: attr(root, 'data-html-contract'),
    title: title ? textOf(title).trim() : '',
    description: meta ? attr(meta, 'content') : null,
    body: serialize(main),
    components,
  };
}

/** Visible text of an HTML document (for the remote's own error pages). */
export function remoteText(html: string): string {
  const document = parse(html);
  const root = document.childNodes.find((n): n is Element => isElement(n) && n.tagName === 'html');
  const body = root?.childNodes.find((n): n is Element => isElement(n) && n.tagName === 'body');
  const parts: string[] = [];
  const collect = (node: Node): void => {
    for (const child of children(node)) {
      if (isElement(child) && (child.tagName === 'script' || child.tagName === 'style')) continue;
      if (child.nodeName === '#text') parts.push((child as DefaultTreeAdapterMap['textNode']).value);
      else collect(child);
      if (isElement(child) && /^(p|h[1-6]|li|div|pre|br|tr)$/.test(child.tagName)) parts.push('\n');
    }
  };
  if (body) collect(body);
  return parts
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, 4000);
}

/** The local descriptor as far as it can be read: htmlContract and component names. */
export interface LocalDescriptor {
  htmlContract: unknown;
  components: Record<string, unknown> | null;
}

export async function readLocalDescriptor(cwd: string): Promise<LocalDescriptor | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(cwd, DESCRIPTOR_PATH), 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const components =
      record.components !== null && typeof record.components === 'object' && !Array.isArray(record.components)
        ? (record.components as Record<string, unknown>)
        : null;
    return { htmlContract: record.htmlContract, components };
  } catch {
    return null;
  }
}

/**
 * Whether the local frontend can render a remote page: the remote contract
 * equals the engine's and the local descriptor's, every component the page
 * uses is declared locally, and the descriptor (assets present) is valid.
 */
export function compatibilityProblems({
  page,
  descriptor,
  descriptorDiagnostics,
  engineContract = HTML_CONTRACT,
}: {
  page: RemotePage;
  descriptor: LocalDescriptor | null;
  descriptorDiagnostics: readonly Diagnostic[];
  engineContract?: number;
}): DevProblem[] {
  const problems: DevProblem[] = [];
  const remote = page.htmlContract;
  if (remote === null) {
    problems.push({
      file: '(remote page)',
      line: null,
      column: null,
      code: 'REMOTE_CONTRACT_MISSING',
      message: 'The remote page has no <html data-html-contract>; it does not look like a Foliwake page.',
      fix: 'Check the configured URL: it must be the Foliwake origin (preview or live).',
    });
  } else {
    if (remote !== String(engineContract)) {
      problems.push({
        file: '(remote page)',
        line: null,
        column: null,
        code: 'REMOTE_CONTRACT_MISMATCH',
        message:
          `The remote page uses HTML contract ${remote}, this CLI's frontend checks use contract ` +
          `${engineContract}.`,
        fix:
          `Use a @foliwake/cli version with HTML contract ${remote}, or develop against a site published with ` +
          `contract ${engineContract}.`,
      });
    }
    if (descriptor && String(descriptor.htmlContract) !== remote) {
      problems.push({
        file: DESCRIPTOR_PATH,
        line: null,
        column: null,
        code: 'REMOTE_CONTRACT_MISMATCH',
        message:
          `${DESCRIPTOR_PATH} has htmlContract ${JSON.stringify(descriptor.htmlContract)}, the remote page ` +
          `uses ${remote}.`,
        fix:
          `Develop this frontend against a site with contract ${JSON.stringify(descriptor.htmlContract)}, or ` +
          `update the components to contract ${remote}.`,
      });
    }
  }
  const declared = descriptor?.components ?? null;
  const undeclared = declared ? page.components.filter((name) => !Object.hasOwn(declared, name)) : [];
  for (const name of undeclared) {
    problems.push({
      file: DESCRIPTOR_PATH,
      line: null,
      column: null,
      code: 'CODE_COMPONENT_NOT_DECLARED',
      message:
        `The remote page uses component "${name}", but ${DESCRIPTOR_PATH} does not declare it; it is not ` +
        `enhanced here.`,
      fix:
        `Add "${name}": {"css": …, "js": …} with its files under components/${name}/, or develop against ` +
        `content without it.`,
    });
  }
  // Descriptor errors that affect this page: an unreadable descriptor and missing assets of used components.
  for (const d of descriptorDiagnostics) {
    if (d.severity !== 'error') continue;
    if (d.component === null || page.components.includes(d.component)) problems.push(toProblem(d));
  }
  return problems;
}
