// `components/editor.json`: the site-level part of the keys for authoring tools — the groups of an editor's
// palette, the label of a section, the folder of editor icons. Like the blocks' authoring keys it never
// changes a page; it is checked so a generated editor package can trust it.
//
//   { "groups": [{ "id": "questions", "label": { "en": "Questions" }, "icon": "quiz" }],
//     "section": { "label": { "en": "Section" } },
//     "icons": "components/editor-icons" }
import { MAX_HELP, TOKEN, isTexts } from './authoring-keys.js';

export const EDITOR_CONFIG_FILE = 'components/editor.json';

export interface EditorGroup {
  id: string;
  label?: Readonly<Record<string, string>>;
  icon?: string;
}

export interface EditorConfig {
  groups: readonly EditorGroup[];
  section?: { label?: Readonly<Record<string, string>> };
  /** the folder of editor icons, relative to the code root, under components/ */
  icons?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const texts = (value: unknown): boolean => isTexts(value, MAX_HELP);
const ICONS = /^components(?:\/[a-z0-9][a-z0-9._-]*)+$/;

/** A problem of the file: a JSON pointer and a message. */
export interface EditorConfigProblem {
  pointer: string;
  message: string;
}

/** Checks the text of components/editor.json; `config` is null when there is any problem. */
export function parseEditorConfig(text: string): { config: EditorConfig | null; problems: EditorConfigProblem[] } {
  const problems: EditorConfigProblem[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { config: null, problems: [{ pointer: '', message: `Not valid JSON: ${(error as Error).message}.` }] };
  }
  if (!isObject(raw))
    return {
      config: null,
      problems: [{ pointer: '', message: 'Must be a JSON object with "groups", "section" and "icons".' }],
    };
  for (const key of Object.keys(raw)) {
    if (['groups', 'section', 'icons'].includes(key)) continue;
    problems.push({
      pointer: `/${key}`,
      message: `Unknown key "${key}"; editor.json has "groups", "section" and "icons".`,
    });
  }
  // Omitted: no groups. Present: a list (null is refused like any other value).
  const groups = raw.groups === undefined ? [] : raw.groups;
  if (!Array.isArray(groups))
    problems.push({ pointer: '/groups', message: '"groups" must be a list of {"id", "label", "icon"}.' });
  else {
    const seen = new Set<string>();
    groups.forEach((group, i) => {
      const at = `/groups/${i}`;
      if (!isObject(group) || Object.keys(group).some((key) => !['id', 'label', 'icon'].includes(key))) {
        problems.push({ pointer: at, message: 'A group is {"id", "label", "icon"}.' });
        return;
      }
      if (typeof group.id !== 'string' || !TOKEN.test(group.id)) {
        problems.push({ pointer: `${at}/id`, message: 'A group needs an "id" of lowercase letters, digits and "-".' });
      } else if (seen.has(group.id)) {
        problems.push({ pointer: `${at}/id`, message: `The group "${group.id}" is listed twice.` });
      } else {
        seen.add(group.id);
      }
      if (group.label !== undefined && !texts(group.label)) {
        problems.push({ pointer: `${at}/label`, message: '"label" must be an object of language → non-empty text.' });
      }
      const icon = group.icon;
      if (icon !== undefined && (typeof icon !== 'string' || !TOKEN.test(icon))) {
        problems.push({ pointer: `${at}/icon`, message: '"icon" must be an icon name.' });
      }
    });
  }
  const section = raw.section;
  if (
    section !== undefined &&
    (!isObject(section) ||
      Object.keys(section).some((key) => key !== 'label') ||
      (section.label !== undefined && !texts(section.label)))
  ) {
    problems.push({ pointer: '/section', message: '"section" is {"label": {language: text}}.' });
  }
  if (
    raw.icons !== undefined &&
    (typeof raw.icons !== 'string' || !ICONS.test(raw.icons) || raw.icons.split('/').includes('..'))
  ) {
    problems.push({
      pointer: '/icons',
      message: '"icons" must be a folder under components/, such as "components/editor-icons".',
    });
  }
  if (problems.length > 0) return { config: null, problems };
  const config: EditorConfig = {
    groups: groups as EditorGroup[],
    ...(section === undefined ? {} : { section: section as EditorConfig['section'] }),
    ...(raw.icons === undefined ? {} : { icons: raw.icons as string }),
  };
  return { config, problems };
}
