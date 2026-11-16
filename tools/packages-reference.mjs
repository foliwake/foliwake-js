#!/usr/bin/env node
// Generates the API sections of the published packages' documentation from their type declarations:
// `pnpm packages:reference`. For each app package (PACKAGES below) it writes the Markdown between the `<!-- api -->`
// and `<!-- apistop -->` markers of packages/<name>/README.md. The README ships in the tarball; the
// documentation site (docs.foliwake.dev/reference/packages/<name>) copies its hand-written part (between the
// `<!-- usage -->` markers) and this API section from the installed package, so the README is the one source.
// test/packages-reference.test.js fails when a README is out of date.
//
// Source: the built declarations (dist/*.d.ts, what a consumer gets) of every entry point in the package's
// `exports`, read with the TypeScript compiler API. The output is deterministic: no dates, no paths, no
// versions; exports are grouped by kind and sorted by name.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The published packages, in the order they are documented. */
export const PACKAGES = ['client', 'react', 'next', 'blocks-contract', 'server'];

/** The files that hold a generated API section, per package. */
export const targets = (name) => [path.join(REPO, 'packages', name, 'README.md')];

const manifest = (name) => JSON.parse(readFileSync(path.join(REPO, 'packages', name, 'package.json'), 'utf8'));

/** Entry points of a package: `{ spec, types }` for declarations, `{ spec, file }` for plain files. */
function entries(name) {
  const pkg = manifest(name);
  const out = [];
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (key === './package.json') continue;
    const spec = key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`;
    if (typeof value === 'object' && value.types) out.push({ spec, types: path.join(REPO, 'packages', name, value.types) });
    else out.push({ spec, file: typeof value === 'string' ? value : value.default });
  }
  return out;
}

// Outside code spans, `<` and `>` as entities: VitePress compiles Markdown as Vue, and a bare `<head>` is an
// unclosed element. GitHub renders the entities the same way.
const html = (text) => text.split('`').map((part, i) => (i % 2 ? part : part.replaceAll('<', '&lt;').replaceAll('>', '&gt;'))).join('`');
const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim();
const prose = (text) => html(oneLine(text));
// A type in a table cell: one line, pipes escaped, `{{` split (Vue interpolation).
const code = (text) => `\`${oneLine(text).replaceAll('|', '\\|').replaceAll('{{', '{ {').replaceAll('}}', '} }')}\``;
const cell = (text) => prose(text).replaceAll('|', '\\|');

function program() {
  const roots = PACKAGES.flatMap((name) => entries(name).filter((e) => e.types).map((e) => e.types));
  return ts.createProgram(roots, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2023,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: ['node'],
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
  });
}

/** Which package a declaration file belongs to (by its real path), or null for a third-party one. */
function ownerOf(fileName) {
  const real = realpathSync(fileName);
  for (const name of PACKAGES) if (real.startsWith(path.join(REPO, 'packages', name, 'dist') + path.sep)) return name;
  return null;
}

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

/** A declaration as source text without comments, `export` or `declare`. */
function print(node) {
  const text = printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
  return text.replace(/^export (default )?/, '').replace(/^declare /, '');
}

function kindOf(decl) {
  if (ts.isFunctionDeclaration(decl)) return 'function';
  if (ts.isClassDeclaration(decl)) return 'class';
  if (ts.isVariableDeclaration(decl)) return 'constant';
  if (ts.isInterfaceDeclaration(decl)) return 'interface';
  if (ts.isTypeAliasDeclaration(decl)) return 'type';
  return 'other';
}

const GROUPS = [
  ['function', 'Functions and components'],
  ['class', 'Classes'],
  ['constant', 'Constants'],
  ['interface', 'Interfaces'],
  ['type', 'Types'],
  ['other', 'Other'],
];

function docOf(checker, symbol) {
  return ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
}

function tagText(tag) {
  return typeof tag.comment === 'string' ? tag.comment : ts.getTextOfJSDocComment(tag.comment) ?? '';
}

function returnsDoc(decl) {
  const tag = ts.getJSDocReturnTag(decl);
  return tag ? oneLine(tagText(tag)).replace(/^-\s*/, '') : '';
}

function paramDoc(param) {
  const tag = ts.getJSDocParameterTags(param)[0];
  return tag ? oneLine(tagText(tag)).replace(/^-\s*/, '') : '';
}

function parameterTable(decl) {
  if (!decl.parameters.length) return [];
  const rows = decl.parameters.map((p) => {
    const name = `${p.dotDotDotToken ? '...' : ''}${p.name.getText()}${p.questionToken || p.initializer ? '?' : ''}`;
    return `| \`${name}\` | ${p.type ? code(p.type.getText()) : ''} | ${cell(paramDoc(p))} |`;
  });
  return ['| Parameter | Type | Description |', '| --- | --- | --- |', ...rows, ''];
}

function memberRows(checker, decl) {
  const rows = [];
  for (const member of decl.members) {
    const symbol = member.name ? checker.getSymbolAtLocation(member.name) : undefined;
    const doc = symbol ? docOf(checker, symbol) : '';
    const readonly = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ? 'readonly ' : '';
    const optional = member.questionToken ? '?' : '';
    if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
      if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword)) continue;
      rows.push(`| \`${readonly}${member.name.getText()}${optional}\` | ${member.type ? code(member.type.getText()) : ''} | ${cell(doc)} |`);
    } else if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
      const params = member.parameters.map((p) => p.getText()).join(', ');
      rows.push(`| \`${member.name.getText()}${optional}()\` | ${code(`(${params}) => ${member.type ? member.type.getText() : 'void'}`)} | ${cell(doc)} |`);
    } else if (ts.isGetAccessorDeclaration(member)) {
      rows.push(`| \`readonly ${member.name.getText()}\` | ${member.type ? code(member.type.getText()) : ''} | ${cell(doc)} |`);
    } else if (ts.isConstructorDeclaration(member)) {
      continue;
    } else {
      rows.push(`| ${code(member.getText().replace(/\/\*\*[\s\S]*?\*\//g, ''))} | | ${cell(doc)} |`);
    }
  }
  return rows.length ? ['| Member | Type | Description |', '| --- | --- | --- |', ...rows, ''] : [];
}

function section(checker, name, symbol, decls) {
  const decl = decls[0];
  const kind = kindOf(decl);
  const doc = docOf(checker, symbol);
  const title = kind === 'function' ? `\`${name}()\`` : `\`${name}\``;
  const lines = [`#### ${title}`, ''];
  if (doc) lines.push(prose(doc), '');
  if (kind === 'function') {
    const signatures = decls.filter((d) => ts.isFunctionDeclaration(d)).map(print).map((s) => s.replace(/;$/, ''));
    lines.push('```ts', ...signatures, '```', '');
    if (decl.parameters.some((p) => paramDoc(p))) lines.push(...parameterTable(decl));
    if (decl.type) lines.push(`**Returns** ${code(decl.type.getText())}${returnsDoc(decl) ? `: ${prose(returnsDoc(decl))}` : ''}`, '');
  } else if (kind === 'constant') {
    const value = decl.type ? `: ${decl.type.getText()}` : decl.initializer ? ` = ${decl.initializer.getText()}` : '';
    lines.push('```ts', `const ${decl.name.getText()}${value}`, '```', '');
  } else if (kind === 'interface') {
    const heritage = decl.heritageClauses?.map((h) => h.getText()).join(' ') ?? '';
    const params = decl.typeParameters ? `<${decl.typeParameters.map((t) => t.getText()).join(', ')}>` : '';
    lines.push('```ts', `interface ${name}${params}${heritage ? ` ${heritage}` : ''}`, '```', '');
    lines.push(...memberRows(checker, decl));
  } else if (kind === 'class') {
    const heritage = decl.heritageClauses?.map((h) => h.getText()).join(' ') ?? '';
    const ctor = decl.members.find(ts.isConstructorDeclaration);
    const ctorParams = ctor ? ctor.parameters.map((p) => p.getText()).join(', ') : '';
    lines.push('```ts', `class ${name}${heritage ? ` ${heritage}` : ''}`, ...(ctor ? [`new ${name}(${ctorParams})`] : []), '```', '');
    lines.push(...memberRows(checker, decl));
  } else {
    lines.push('```ts', print(decl).replace(/;$/, ''), '```', '');
  }
  return { kind, text: lines.join('\n') };
}

/** The API section of one package, as Markdown. */
export function renderPackageApi(name, prog = program()) {
  const checker = prog.getTypeChecker();
  // Where each exported declaration is documented: the first entry of its own package that exports it.
  const home = new Map();
  for (const pkg of PACKAGES) {
    for (const entry of entries(pkg).filter((e) => e.types)) {
      const source = prog.getSourceFile(entry.types);
      if (!source) throw new Error(`${entry.types} is missing; run the build first (pnpm build).`);
      for (const exported of checker.getExportsOfModule(checker.getSymbolAtLocation(source))) {
        const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        const decl = target.declarations?.[0];
        if (!decl || ownerOf(decl.getSourceFile().fileName) !== pkg) continue;
        if (!home.has(target)) home.set(target, entry.spec);
      }
    }
  }

  const out = [];
  for (const entry of entries(name)) {
    out.push(`### \`${entry.spec}\``, '');
    if (entry.file) {
      out.push(`A file, not a module: \`${entry.file.replace(/^\.\//, '')}\` in the package.`, '');
      continue;
    }
    const source = prog.getSourceFile(entry.types);
    const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(source));
    const own = [];
    const elsewhere = new Map();
    for (const exported of exports) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const decls = target.declarations ?? [];
      const where = home.get(target);
      if (where && where !== entry.spec) {
        if (!elsewhere.has(where)) elsewhere.set(where, []);
        elsewhere.get(where).push(exported.name);
      } else if (decls.length) {
        own.push(section(checker, exported.name, target, decls));
        own.at(-1).name = exported.name;
      }
    }
    if (!own.length && !elsewhere.size) out.push('Nothing is exported.', '');
    for (const [kind, heading] of GROUPS) {
      const items = own.filter((s) => s.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
      if (!items.length) continue;
      out.push(`**${heading}**`, '', ...items.map((s) => s.text));
    }
    if (elsewhere.size) {
      out.push('**Also exported** (documented where they are defined)', '');
      for (const [where, names] of [...elsewhere].sort(([a], [b]) => a.localeCompare(b))) {
        out.push(`- from \`${where}\`: ${names.sort((a, b) => a.localeCompare(b)).map((n) => `\`${n}\``).join(', ')}`);
      }
      out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function between(text, file, name) {
  const start = `<!-- ${name} -->`;
  const end = `<!-- ${name}stop -->`;
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from === -1 || to === -1 || to < from) throw new Error(`${file} has lost its ${name} markers`);
  return { from: from + start.length, to };
}

function replaceBetween(text, file, body, name = 'api') {
  const { from, to } = between(text, file, name);
  return `${text.slice(0, from)}\n\n${body}\n\n${text.slice(to)}`;
}

/** Every README as it should be: Map of absolute path → [current text, expected text]. */
export function renderReferences() {
  const prog = program();
  const result = new Map();
  for (const name of PACKAGES) {
    const generated = '<!-- Generated by `pnpm packages:reference` from the type declarations; do not edit by hand. -->';
    const body = `${generated}\n\n${renderPackageApi(name, prog)}`;
    const [readme] = targets(name);
    const readmeText = readFileSync(readme, 'utf8');
    between(readmeText, readme, 'usage'); // the site copies this part: the markers must stay
    result.set(readme, [readmeText, replaceBetween(readmeText, readme, body)]);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [file, [current, expected]] of renderReferences()) {
    if (current !== expected) {
      writeFileSync(file, expected);
      console.log(`updated ${path.relative(REPO, file)}`);
    }
  }
}
