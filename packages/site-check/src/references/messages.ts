// The texts of the problems of reference tables, kept apart from the logic that finds them (tables.ts). The
// engine keeps the texts of the problems of the references a page writes next to its own resolver.

import { DEFAULT_SET, REFERENCE_LIMITS, REFERENCES_SCHEMA } from './tables.js';

/** What is wrong and, when the text has one, how to fix it. */
export interface ProblemText {
  message: string;
  fix: string | null;
}

function problem(message: string, fix: string | null = null): ProblemText {
  return { message, fix };
}

/** Problems of the tables `references/<kind>.json` (REFERENCES_TABLE_INVALID, REFERENCES_IMAGE_MISSING). */
export const TABLE_PROBLEMS = {
  tooManyKinds: (count: number) =>
    problem(
      `The site declares ${count} reference kinds; at most ${REFERENCE_LIMITS.kinds} are allowed.`,
      'Remove the reference tables the site does not use.',
    ),
  moreInFile: (more: number) => problem(`… and ${more} more problem(s) in this file.`),
  kindInvalid: (kind: string) =>
    problem(
      `Invalid reference kind "${kind}".`,
      'Name the file `references/<kind>.json` with lowercase letters, digits and "-", ' +
        'starting with a letter (at most 32).',
    ),
  kindIsLinkScheme: (kind: string) =>
    problem(`"${kind}" is a link scheme; it cannot be a reference kind.`, 'Choose another kind name.'),
  fileTooLarge: (bytes: number) =>
    problem(
      `The file has ${bytes} bytes; a reference table may have at most ${REFERENCE_LIMITS.fileBytes} (1 MiB).`,
      'Split the kind, or drop entries the site does not use.',
    ),
  notJson: (reason: string) => problem(`Not valid JSON: ${reason}.`, 'Fix the JSON syntax.'),
  notObject: () => problem('A reference table is a JSON object.'),
  schemaRefNotString: () => problem('"$schema" must be a string.'),
  unknownKey: (key: string) => problem(`Unknown key "${key}".`, 'Allowed keys: schema, render, pattern, by, sets.'),
  schemaInvalid: () => problem(`"schema" must be "${REFERENCES_SCHEMA}".`),
  renderInvalid: () => problem('"render" must be "image" or "term".'),
  patternInvalid: () =>
    problem(
      `"pattern" must be a regular expression of 1–${REFERENCE_LIMITS.patternLength} characters.`,
      'Anchor it, e.g. "^[0-9A-Z]+(?:\\\\.[0-9]+)*$".',
    ),
  patternNotRegExp: (reason: string) => problem(`"pattern" is not a valid regular expression: ${reason}.`),
  byInvalid: () =>
    problem('"by" must name a page field (lowercase letters, digits and "_", starting with a letter), e.g. "country".'),
  setsNotObject: () => problem('"sets" must be an object of sets.'),
  setNotDefault: (setName: string) =>
    problem(
      `A table without "by" has one set, "${DEFAULT_SET}"; found "${setName}".`,
      `Name the set "${DEFAULT_SET}", or select sets by a page field with "by".`,
    ),
  setNameInvalid: (setName: string) =>
    problem(`Invalid set name "${setName}".`, 'A set name has 1–32 lowercase letters, digits, "_" and "-".'),
  setNotObject: () => problem('A set is an object of entries by value.'),
  tooManyEntries: (count: number) =>
    problem(`The set has ${count} entries; at most ${REFERENCE_LIMITS.entriesPerSet} are allowed.`),
  valueUnusable: (value: string) =>
    problem(
      `The value "${value.slice(0, 80)}" does not match "pattern" ` +
        `(or is longer than ${REFERENCE_LIMITS.valueLength} characters), so no page could use it.`,
    ),
  entryNotObject: () => problem('An entry is an object.'),
  entryUnknownKey: (key: string, render: string, allowed: readonly string[]) =>
    problem(`Unknown key "${key}" for a "${render}" table.`, `Allowed keys: ${allowed.join(', ')}.`),
  imageInvalid: () =>
    problem(
      '"image" must be a path inside references/ ' +
        '(no "..", an image extension: svg, png, jpg, jpeg, webp, avif, gif) or an https: URL.',
    ),
  sideInvalid: (side: string) =>
    problem(`"${side}" must be a whole number of pixels, 1–${REFERENCE_LIMITS.imageSide}.`),
  hrefInvalid: () => problem('"href" must be a root path ("/…") or an https: URL.'),
  langTextInvalid: (key: string) =>
    problem(
      `"${key}" must be an object of texts by language ({"en": "…"}), ` +
        `each 1–${REFERENCE_LIMITS.textLength} characters.`,
    ),
  imageMissing: (releasePath: string) =>
    problem(
      `${releasePath} is not a file of the site code.`,
      'Add the image under references/ (and commit it), or fix the path.',
    ),
};
