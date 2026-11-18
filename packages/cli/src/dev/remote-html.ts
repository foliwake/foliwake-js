// HTML of `foliwake dev --remote` itself: the problem and notice banners above a remote page, its error
// pages, and the stub of the block catalog.
import { escapeHtml } from './html.js';
import type { DevProblem } from './dev-reload.js';

const BANNER_STYLE = 'font:14px/1.45 system-ui,sans-serif;color:#1b1b1b;padding:10px 16px';
const ALERT_STYLE = `${BANNER_STYLE};background:#fff5f5;border-bottom:4px solid #b00020`;
const NOTICE_STYLE = `${BANNER_STYLE};background:#fffaf0;border-bottom:4px solid #a15c00`;
const ERROR_PAGE_STYLE =
  'body{font:15px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:60rem;padding:0 1rem;color:#1b1b1b}' +
  'h1{font-size:1.4rem}' +
  'pre{white-space:pre-wrap;background:#f6f6f6;padding:.6rem .8rem;border-left:4px solid #b00020}';
const DIAGNOSTICS_LINK = 'local diagnostics: <a href="/_dev/diagnostics">/_dev/diagnostics</a>';

function problemItem(p: DevProblem): string {
  const where = p.line == null ? p.file : `${p.file}:${p.line}${p.column == null ? '' : `:${p.column}`}`;
  const fix = p.fix ? `<br>Fix: ${escapeHtml(p.fix)}` : '';
  return `<li><code>${escapeHtml(where)}</code> <code>${escapeHtml(p.code)}</code> ${escapeHtml(p.message)}${fix}</li>`;
}

/** The problems as JSON inside a script element: `<`, `>` and `&` escaped. */
function problemsJson(problems: readonly DevProblem[]): string {
  return JSON.stringify(problems).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function problemsBanner(title: string, problems: readonly DevProblem[]): string {
  const items = problems.map(problemItem).join('');
  const list = items ? `<ol style="margin:6px 0;padding-left:20px">${items}</ol>` : '';
  return `<div data-foliwake-dev-banner role="alert" style="${ALERT_STYLE}">
<strong>${escapeHtml(title)}</strong>${list}
</div>
<script type="application/json" data-foliwake-dev-problems>${problemsJson(problems)}</script>`;
}

export function noticeBanner(text: string): string {
  return `<div data-foliwake-dev-banner role="status" style="${NOTICE_STYLE}">${escapeHtml(text)}</div>`;
}

export function renderRemoteErrorPage({
  title,
  lines,
  detail,
}: {
  title: string;
  lines: readonly string[];
  detail?: string | null;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)}</title>
  <style>${ERROR_PAGE_STYLE}</style>
</head>
<body data-foliwake-dev-error>
  <h1>${escapeHtml(title)}</h1>
${lines.map((line) => `  <p>${escapeHtml(line)}</p>`).join('\n')}${detail ? `\n  <pre>${escapeHtml(detail)}</pre>` : ''}
  <p style="color:#555">foliwake dev --remote · ${DIAGNOSTICS_LINK}</p>
</body>
</html>
`;
}

/** `/_dev/blocks` and the block catalog: not available without a block renderer. */
export function blockCatalogStub(): string {
  return renderRemoteErrorPage({
    title: 'Block catalog not available',
    lines: [
      'The block catalog renders the examples of your blocks (components/<name>/<name>.example.md).',
      `Rendering them needs the Foliwake engine (\`foliwake dev\` from the engine) or the open block ` +
        'renderer, which is not available yet.',
      'Pages from the remote site work as usual: open any page path.',
    ],
  });
}
