// The front-matter `id` of a Markdown page, read with the engine's rules (byte offsets of its value).

// The front matter's `id` line: byte offsets of its value token (quotes
// excluded) in a latin1 view of the document, so offsets are byte offsets.
interface IdToken {
  start: number;
  end: number;
}

const FENCE = /^---[ \t]*$/;
// `id:` at column 1, then a plain or quoted single-line scalar and an optional comment.
const ID_KEY = /^id[ \t]*:(?=[ \t]|$)/;
const ID_LINE =
  /^id[ \t]*:[ \t]*(?:"([^"\\\r\n]*)"|'([^'\r\n]*)'|([^\s#'"\[\]{}|>&*!%@`,][^\r\n#]*?))?[ \t]*(?:#[^\r\n]*)?$/;

function findIdToken(view: string): { token: IdToken | null; reason: string | null } {
  // Lines with their start offsets; `\n` ends a line, a preceding `\r` is kept out of the content.
  const lines: Array<{ start: number; text: string }> = [];
  let offset = 0;
  while (offset <= view.length) {
    const newline = view.indexOf('\n', offset);
    const end = newline === -1 ? view.length : newline;
    const raw = view.slice(offset, end);
    lines.push({ start: offset, text: raw.endsWith('\r') ? raw.slice(0, -1) : raw });
    if (newline === -1) break;
    offset = newline + 1;
  }
  if (lines.length === 0 || !FENCE.test(lines[0].text))
    return { token: null, reason: 'the document has no front matter (it must start with a `---` line)' };
  const close = lines.findIndex((line, i) => i > 0 && FENCE.test(line.text));
  if (close === -1) return { token: null, reason: 'the front matter has no closing `---` line' };
  let token: IdToken | null = null;
  for (const line of lines.slice(1, close)) {
    if (!ID_KEY.test(line.text)) continue;
    if (token) return { token: null, reason: 'the front matter has more than one `id:` line' };
    const match = ID_LINE.exec(line.text);
    const value = match ? (match[1] ?? match[2] ?? match[3]) : undefined;
    if (!match || value === undefined || value === '')
      return { token: null, reason: 'the front-matter `id:` value is not a single-line scalar' };
    // Index of the value inside the line: after the `:` and spaces, plus one for an opening quote.
    const colon = line.text.indexOf(':');
    let at = colon + 1;
    while (line.text[at] === ' ' || line.text[at] === '\t') at += 1;
    if (match[1] !== undefined || match[2] !== undefined) at += 1;
    token = { start: line.start + at, end: line.start + at + value.length };
  }
  if (!token) return { token: null, reason: 'the front matter has no `id:` line' };
  return { token, reason: null };
}

const latin1 = (bytes: Uint8Array): string =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');

/**
 * The front-matter `id` value as written (quotes removed), or null when the
 * document has no single, single-line `id:` value. The caller checks the
 * grammar (isValidPageId).
 */
export function frontMatterId(markdown: Uint8Array): string | null {
  const view = latin1(markdown);
  const { token } = findIdToken(view);
  if (!token) return null;
  return Buffer.from(markdown.subarray(token.start, token.end)).toString('utf8');
}
