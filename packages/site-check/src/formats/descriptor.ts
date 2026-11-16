// The component descriptor `components/components.json`: which assets (CSS, JS) each block has. Checked for a
// working folder and for the captured files of a code release alike; the caller supplies file access, so both
// see one rule set. A site without a hand-written descriptor gets one generated from its block folders.

import { COMPONENT_NAME_PATTERN } from './constants.js';
import { type Diagnostic, makeDiagnostic } from './diagnostics.js';

export const DESCRIPTOR_PATH = 'components/components.json';

/** components/components.json once validated: which assets each component has. */
export interface ComponentDescriptor {
  htmlContract: number;
  /** `ui`: the block's labels by UI language, then key (blocks contract BlockMeta.ui) */
  components: Record<string, { css: boolean; js: boolean; ui?: Record<string, Record<string, string>> }>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/** A valid `ui`: language → key → non-empty text. */
function validUi(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    Object.values(value).every(
      (labels) =>
        isPlainObject(labels) && Object.values(labels).every((text) => typeof text === 'string' && text !== ''),
    )
  );
}

function diagnostic(
  code: string,
  file: string,
  message: string,
  fix: string | null = null,
  component: string | null = null,
): Diagnostic {
  return makeDiagnostic({ code, file, component, message, fix });
}

function entryShapeMessage(name: string): string {
  const shape = '{"css": boolean, "js": boolean}';
  return `Component "${name}" must be exactly ${shape}, optionally with "ui": {language: {key: text}}.`;
}

export interface DescriptorChecks {
  /** Descriptor text; throws (error.code 'ENOENT' when missing). */
  readText: () => Promise<string>;
  /** A regular file exists at a release-relative path. */
  hasFile: (relativePath: string) => Promise<boolean>;
  /** Version the generator produces. */
  htmlContract: number;
  /** Every generator schema name (each must be declared). */
  schemaNames: readonly string[];
}

/** Diagnostics; errors block, CODE_ASSET_UNDECLARED is a warning. */
export async function validateDescriptor({
  readText,
  hasFile,
  htmlContract,
  schemaNames,
}: DescriptorChecks): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  let descriptor: unknown;
  try {
    descriptor = JSON.parse(await readText());
  } catch (error) {
    const reason =
      (error as { code?: unknown }).code === 'ENOENT'
        ? 'File not found.'
        : `Cannot read it as JSON: ${(error as Error).message}`;
    return [
      diagnostic(
        'CODE_DESCRIPTOR_INVALID',
        DESCRIPTOR_PATH,
        reason,
        `Create it as {"htmlContract": ${htmlContract}, "components": {…}}.`,
      ),
    ];
  }

  const invalid = (message: string, fix: string | null = null, component: string | null = null) =>
    diagnostics.push(diagnostic('CODE_DESCRIPTOR_INVALID', DESCRIPTOR_PATH, message, fix, component));

  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    invalid('The descriptor must be a JSON object.');
    return diagnostics;
  }
  const record = descriptor as Record<string, unknown>; // a JSON object (checked above)
  for (const key of Object.keys(record)) {
    if (key !== 'htmlContract' && key !== 'components')
      invalid(`Unknown top-level key "${key}".`, 'Allowed keys: htmlContract, components.');
  }
  if (record.htmlContract !== htmlContract) {
    invalid(
      `htmlContract is ${JSON.stringify(record.htmlContract)}, but the generator produces version ${htmlContract}.`,
      `Set "htmlContract": ${htmlContract}.`,
    );
  }
  const components = record.components;
  if (components === null || typeof components !== 'object' || Array.isArray(components)) {
    invalid('"components" must be an object mapping names to {"css": boolean, "js": boolean}.');
    return diagnostics;
  }

  for (const [name, entry] of Object.entries(components)) {
    if (!COMPONENT_NAME_PATTERN.test(name)) {
      invalid(
        `Invalid component name "${name}".`,
        'Use lowercase letters, digits and hyphens, starting with a letter.',
        name,
      );
      continue;
    }
    const fields =
      entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null;
    const keys = fields
      ? Object.keys(fields)
          .filter((key) => key !== 'ui')
          .sort()
      : null;
    if (
      !fields ||
      !keys ||
      keys.join(',') !== 'css,js' ||
      typeof fields.css !== 'boolean' ||
      typeof fields.js !== 'boolean' ||
      ('ui' in fields && !validUi(fields.ui))
    ) {
      invalid(entryShapeMessage(name), null, name);
      continue;
    }
    for (const kind of ['css', 'js'] as const) {
      const relative = `components/${name}/${name}.${kind}`;
      const exists = await hasFile(relative);
      if (fields[kind] && !exists) {
        diagnostics.push(
          diagnostic(
            'CODE_ASSET_MISSING',
            relative,
            `The descriptor declares ${kind} for "${name}", but the file does not exist.`,
            `Create ${relative} or set "${kind}": false.`,
            name,
          ),
        );
      } else if (!fields[kind] && exists) {
        diagnostics.push(
          diagnostic(
            'CODE_ASSET_UNDECLARED',
            relative,
            `The file exists, but the descriptor says "${kind}": false, so it is never loaded.`,
            `Set "${kind}": true for "${name}" or delete the file.`,
            name,
          ),
        );
      }
    }
  }

  for (const name of schemaNames) {
    if (!Object.hasOwn(components, name)) {
      diagnostics.push(
        diagnostic(
          'CODE_SCHEMA_NOT_DECLARED',
          DESCRIPTOR_PATH,
          `Content schema "${name}" has no entry in the descriptor.`,
          `Add "${name}": {"css": …, "js": …}.`,
          name,
        ),
      );
    }
  }
  return diagnostics;
}

/**
 * The components of a page whose stylesheet the page shell links: the names in
 * `used` that match COMPONENT_NAME_PATTERN and that the descriptor declares with
 * "css": true, sorted, without duplicates. `descriptor` is whatever was read
 * (a store record or a local file), so anything that is not such an object
 * gives no names.
 */
export function shellStylesheets(used: readonly string[] | null | undefined, descriptor: unknown): string[] {
  const components =
    descriptor !== null && typeof descriptor === 'object' ? (descriptor as { components?: unknown }).components : null;
  if (!used || components === null || typeof components !== 'object') return [];
  const declared = components as Record<string, unknown>;
  // Defense in depth: a validated descriptor has no other names, and a stylesheet
  // URL is never built from one.
  const linked = used.filter((name) => {
    if (typeof name !== 'string' || !COMPONENT_NAME_PATTERN.test(name)) return false;
    const entry = Object.hasOwn(declared, name) ? declared[name] : null;
    return entry !== null && typeof entry === 'object' && (entry as { css?: unknown }).css === true;
  });
  return [...new Set(linked)].sort();
}
