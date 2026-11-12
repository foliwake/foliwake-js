// The page check (design §9.4): a body is trusted Foliwake output from the configured origin, and still
// checked, before and after the app's preparation, failing closed. What passes is serialised again from
// the checked tree, so the browser parses exactly what was checked.
import { FoliwakePageError } from './errors.js';
import { elements, HtmlParseError, parseStrict, serialize, type HtmlElement, type HtmlNode } from './html-parse.js';

export { HtmlParseError, parseStrict, serialize, elements } from './html-parse.js';
export type { HtmlElement, HtmlNode, HtmlText } from './html-parse.js';

/**
 * Elements a body may not hold (incl. foreign content: no inline SVG or MathML in 0.1). `<form>` is allowed only
 * as the engine writes it for the question block: an explicit `method="dialog"`, no `action`, `target` or
 * `enctype`; no control may override the submission (`formmethod`, `formaction`, `formtarget`, `formenctype`)
 * or associate itself with another form (`form`). Such a form closes a dialog at most; it submits nowhere.
 */
export const REFUSED_ELEMENTS: ReadonlySet<string> = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base', 'meta', 'link',
  'noscript', 'template', 'svg', 'math', 'xmp', 'plaintext', 'noembed', 'noframes', 'portal', 'fencedframe',
]);
const REFUSED_ATTRIBUTES = new Set(['srcdoc', 'formaction', 'formmethod', 'formtarget', 'formenctype', 'form', 'style', 'is', 'ping']);
const ELEMENT_NAME = /^[a-z][a-z0-9-]*$/;
const ATTRIBUTE_NAME = /^[a-z_][a-z0-9_.-]*$/;
/** Attributes holding one URL. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'poster', 'cite', 'background', 'longdesc', 'action', 'data', 'lowsrc', 'dynsrc', 'manifest', 'codebase', 'xlink']);
const DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif)[;,]/i;
const BASE = 'https://page.invalid';
const DESCRIPTOR = /^(?:\d+w|\d+(?:\.\d+)?x)$/;
/** A valid `data-component` name. */
export const COMPONENT_NAME = /^[a-z][a-z0-9-]*$/;

function invalid(message: string, cause?: unknown): FoliwakePageError {
  return new FoliwakePageError('invalid', `The page body was refused: ${message}`, { cause });
}

/** Why a URL value is not allowed for this element/attribute, or null. Values are entity-decoded already. */
export function urlProblem(element: string, attribute: string, value: string, pagePath = '/'): string | null {
  if (attribute === 'src' && element === 'img' && DATA_IMAGE.test(value.trim())) return null;
  // As the URL parser sees it: tabs and newlines removed, leading C0 controls and spaces stripped.
  const stripped = value.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+/, '');
  if (/^[\\/]{2}/.test(stripped)) return `<${element} ${attribute}> is a scheme-relative URL (another host)`;
  let url: URL;
  try {
    url = new URL(value, `${BASE}${pagePath}`);
  } catch {
    return `<${element} ${attribute}> is not a valid URL`;
  }
  if (url.origin === BASE) return null; // relative (or root-relative) on the app's own origin
  if (url.protocol === 'https:') return null;
  if (attribute === 'href' && (url.protocol === 'mailto:' || url.protocol === 'tel:')) return null;
  return `<${element} ${attribute}> uses ${url.protocol === 'https:' ? 'another host' : `the scheme ${url.protocol}`} (allowed: relative, https:${attribute === 'href' ? ', mailto:, tel:' : ''})`;
}

/** Splits a srcset into candidates: the URL ends at whitespace; descriptors run to the next comma. */
export function srcsetCandidates(srcset: string): { url: string; descriptor: string }[] {
  const out: { url: string; descriptor: string }[] = [];
  let i = 0;
  const n = srcset.length;
  const space = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  while (i < n) {
    while (i < n && (space(srcset[i]!) || srcset[i] === ',')) i++;
    if (i >= n) break;
    let url = '';
    while (i < n && !space(srcset[i]!)) url += srcset[i++];
    let descriptor = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      while (i < n && srcset[i] !== ',') descriptor += srcset[i++];
      descriptor = descriptor.trim();
    }
    out.push({ url, descriptor });
  }
  return out;
}

function checkElement(element: HtmlElement, pagePath: string): void {
  if (!ELEMENT_NAME.test(element.name)) throw invalid(`the element <${element.name.slice(0, 30)}> is not allowed`);
  if (REFUSED_ELEMENTS.has(element.name)) throw invalid(`the element <${element.name}> is not allowed`);
  if (element.name === 'form') {
    const a = element.attribs;
    // Exactly `dialog` (ASCII case-insensitive, as HTML matches enumerated keywords). No trimming: HTML does not
    // trim either, so `method=" dialog "` is an invalid value that falls back to GET (Codex recheck of #133).
    if (a.method?.toLowerCase() !== 'dialog' || 'action' in a || 'target' in a || 'enctype' in a) {
      throw invalid('a <form> may only be <form method="dialog"> without action, target or enctype');
    }
  }
  for (const [name, value] of Object.entries(element.attribs)) {
    if (!ATTRIBUTE_NAME.test(name)) throw invalid(`the attribute ${JSON.stringify(name.slice(0, 30))} on <${element.name}> is not allowed`);
    if (name.startsWith('on') || name.startsWith('xmlns') || REFUSED_ATTRIBUTES.has(name)) throw invalid(`the attribute ${name} on <${element.name}> is not allowed`);
    if (URL_ATTRIBUTES.has(name)) {
      const problem = urlProblem(element.name, name, value, pagePath);
      if (problem) throw invalid(problem);
    }
    if (name === 'srcset' || name === 'imagesrcset') {
      for (const candidate of srcsetCandidates(value)) {
        if (candidate.descriptor !== '' && !DESCRIPTOR.test(candidate.descriptor)) throw invalid(`<${element.name} srcset> has the descriptor ${JSON.stringify(candidate.descriptor.slice(0, 20))}`);
        const problem = urlProblem(element.name, 'srcset', candidate.url, pagePath);
        if (problem) throw invalid(problem);
      }
    }
    if (name === 'data-component' && !COMPONENT_NAME.test(value)) throw invalid(`the component name ${JSON.stringify(value.slice(0, 40))} is not valid`);
  }
}

/** Parses and checks a body; returns the checked tree. Throws FoliwakePageError('invalid'). */
export function checkBody(html: string, pagePath = '/'): HtmlNode[] {
  let nodes: HtmlNode[];
  try {
    nodes = parseStrict(html);
  } catch (error) {
    if (error instanceof HtmlParseError) throw invalid(error.message, error);
    throw error;
  }
  for (const element of elements(nodes)) checkElement(element, pagePath);
  return nodes;
}

/** Checks a body (the strict body check); throws FoliwakePageError('invalid'). */
export function checkPlainBody(html: string, pagePath = '/'): void {
  checkBody(html, pagePath);
}

/** Distinct `data-component` names, sorted. */
export function componentNames(nodes: readonly HtmlNode[]): string[] {
  const names = new Set<string>();
  for (const element of elements(nodes)) {
    const name = element.attribs['data-component'];
    if (name !== undefined) names.add(name);
  }
  return [...names].sort();
}

/** The checked body, serialised from its tree. */
export function sanitizedHtml(nodes: readonly HtmlNode[]): string {
  return serialize(nodes);
}
