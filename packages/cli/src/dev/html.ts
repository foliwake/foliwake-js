// HTML produced by the dev server itself: the page shell and the diagnostics pages. Every author-controlled
// value is escaped here.
import { KIT_PATH, KIT_SPECIFIER } from '@foliwake/blocks-contract/import-map';
import type { Diagnostic } from '@foliwake/site-check/formats/diagnostics';

/** The language of the shell when the page names none. */
const SHELL_LANG = 'en';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/**
 * The import map of a code release at `codeBase`: blocks import the kit as `@foliwake/block-kit`, which
 * resolves to the kit of the release (`<codeBase>_foliwake/block-kit.js`). `<` is escaped.
 */
export function importMapScript(codeBase: string): string {
  const map = JSON.stringify({ imports: { [KIT_SPECIFIER]: `${codeBase}${KIT_PATH}` } });
  return `<script type="importmap">${map.replaceAll('<', '\\u003c')}</script>`;
}

/** The link of one component's stylesheet in the shell. */
function componentStylesheet(name: string): string {
  const href = escapeHtml(`/components/${name}/${name}.css`);
  return `\n  <link rel="stylesheet" href="${href}" data-component-css="${escapeHtml(name)}">`;
}

// Local shell: code base is `/`, environment is `local`; the import map maps
// `@foliwake/block-kit` to /_foliwake/block-kit.js, which the dev server serves. `componentCss` names
// the components whose stylesheet is linked after the global one (shellStylesheets of
// @foliwake/site-check); the loader reuses those links.
/** The page fields the local shell renders. */
export interface ShellPage {
  title: string;
  description: string | null;
  body: string;
}

// `devBanner` (dev server HTML, already escaped) is placed before <main>, so
// the content inside <main> is exactly the page body; local Markdown pages
// have none.
export function renderPageShell({
  page,
  lang = SHELL_LANG,
  htmlContract,
  devBanner = '',
  componentCss = [],
  template = null,
}: {
  page: ShellPage;
  lang?: string;
  htmlContract: number;
  devBanner?: string;
  componentCss?: readonly string[];
  template?: { name: string; css: boolean; js: boolean } | null;
}): string {
  const templateBase = template ? `/templates/${template.name}/${template.name}` : '';
  const templateAttribute = template ? ` data-template="${escapeHtml(template.name)}"` : '';
  const templateStyle = template?.css
    ? `\n  <link rel="stylesheet" href="${escapeHtml(`${templateBase}.css`)}" data-template-css>`
    : '';
  const templateScript = template?.js
    ? `\n  <script type="module" src="${escapeHtml(`${templateBase}.js`)}"></script>`
    : '';
  const componentStyles = componentCss.map(componentStylesheet).join('');
  const description =
    page.description == null ? '' : `\n  <meta name="description" content="${escapeHtml(page.description)}">`;
  return `<!doctype html>
<html lang="${escapeHtml(lang)}" data-env="local" data-html-contract="${htmlContract}"${templateAttribute}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${importMapScript('/')}
  <title>${escapeHtml(page.title)}</title>${description}
  <link rel="stylesheet" href="/styles/styles.css">${templateStyle}${componentStyles}
  <script type="module" src="/scripts/components.js"></script>${templateScript}
</head>
<body>${devBanner ? `\n${devBanner}` : ''}
  <main>
${page.body}
  </main>
</body>
</html>
`;
}

const ALL_DIAGNOSTICS = 'All diagnostics: <a href="/_dev/diagnostics">/_dev/diagnostics</a>';

const DIAGNOSTICS_STYLE = `
  body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; color: #1b1b1b; }
  h1 { font-size: 1.4rem; }
  ol { padding-left: 1.2rem; }
  li { margin: 0 0 1rem; padding: .6rem .8rem; border-left: 4px solid #b00020; background: #fff5f5; }
  li.warning { border-color: #a15c00; background: #fffaf0; }
  code { font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .where { font-weight: 600; }
  .fix { margin-top: .3rem; }
  .muted { color: #555; }
`;

function renderDiagnosticItem(d: Diagnostic): string {
  const where = `${d.file}:${d.line}:${d.column}`;
  const scope = [d.component, d.field].filter((v) => v != null).join(' ');
  const scoped = scope ? ` <code>${escapeHtml(scope)}</code>` : '';
  const head = `<code class="where">${escapeHtml(where)}</code> <strong>${escapeHtml(d.severity)}</strong>`;
  const fix = d.fix ? `\n      <div class="fix">Fix: ${escapeHtml(d.fix)}</div>` : '';
  return `    <li class="${escapeHtml(d.severity)}">
      <div>${head} <code>${escapeHtml(d.code)}</code>${scoped}</div>
      <div>${escapeHtml(d.message)}</div>${fix}
    </li>`;
}

export function renderDiagnosticsPage({
  title,
  intro,
  diagnostics,
}: {
  title: string;
  intro: string;
  diagnostics: readonly Diagnostic[] | null;
}): string {
  let items = '';
  if (diagnostics) {
    items = diagnostics.length
      ? `  <ol>\n${diagnostics.map(renderDiagnosticItem).join('\n')}\n  </ol>`
      : '  <p>No diagnostics.</p>';
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${DIAGNOSTICS_STYLE}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">${escapeHtml(intro)} Fix the source file and refresh. ${ALL_DIAGNOSTICS}.</p>
${items}
</body>
</html>
`;
}
