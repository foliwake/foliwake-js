# @foliwake/site-check

<!-- usage -->

`@foliwake/site-check` holds the checks the Foliwake platform runs on a site's code repository: block
definitions, page templates, `site.yaml`, `query.yaml`, `access.yaml`, reference tables, the component
descriptor, the layout of the code folders and the references of scripts and stylesheets. The platform runs
exactly this code before its own steps, so a problem found here has the same code, text and fix locally and on
the server.

What it does not do: render block examples or pages. That needs the engine (`foliwake page check` locally, or
the branch preview on the platform).

## Library

```js
import { checkSiteCode, formatDiagnostic, hasErrors } from '@foliwake/site-check';

const result = await checkSiteCode('.');
for (const diagnostic of result.diagnostics) console.log(formatDiagnostic(diagnostic));
process.exitCode = hasErrors(result.diagnostics) ? 1 : 0;
```

- `checkSiteCode(dir, options?)` reads a folder the way the platform captures a commit of it: the regular files
  under `components/`, `scripts/`, `styles/`, `templates/` and `references/` with a code file type, the block
  example files, and `site.yaml`, `query.yaml` and `access.yaml` at the root. Other files under those folders
  are listed in `ignored` with a `CODE_PATH_IGNORED` note. Nothing else is read (`content/` never is).
- `checkCodeRelease(files, options?)` checks the captured files themselves (a `Map` of posix path → bytes).
- Both resolve to `{ diagnostics, siteCode, query, access, captured, ignored }`; the diagnostics are sorted.
- Options: `htmlContract` (default `HTML_CONTRACT`), `engineFiles` (the engine's files a release holds under
  `_foliwake/`), `catalogueComponents` (the names a hand-written `components/components.json` must declare).

Finer entries: `site-code` (the reader: block pack, descriptor, templates, `site.yaml` default, reference
tables), `blocks/pack`, `blocks/schema` (the JSON Schema of a block definition), `blocks/examples`,
`blocks/editor-config`, `references/tables`, `code-references`, `descriptor-check`, `urls`.

## Formats

`@foliwake/site-check/formats/*` are pure modules: no Node imports, no file system, no network. They describe
the files an author writes and are shared with the platform's delivery.

| Entry | What |
| --- | --- |
| `formats/constants` | `HTML_CONTRACT`, `AUTHORING_DIALECTS`, `RESERVED_PREFIXES`, name patterns, `SITE_ID` |
| `formats/code-files` | the file types of site code: `CODE_FILE_EXTENSIONS`, `CODE_ASSET_TYPES`, `isCodeExtension` |
| `formats/layout` | what a code release captures (`CODE_ROOTS`, `CODE_ROOT_FILES`, `isCapturedInput`), the required and the generated files, `CODE_LIMITS` |
| `formats/yaml` | the strict YAML reader: no tags, anchors, aliases, merge keys, duplicate keys or extra documents |
| `formats/site-config` | `site.yaml`: `parseSiteConfig` |
| `formats/query` | `query.yaml` (`foliwake-query/1`): `parseQueryConfig`, the bounded glob grammar and matching |
| `formats/access` | `access.yaml`: `parseAccessConfig`, `isOpenPath` |
| `formats/templates` | page templates (`foliwake-templates/1`): definitions, the registry and the page rules |
| `formats/descriptor` | `components/components.json`: `validateDescriptor` |
| `formats/diagnostics` | the diagnostic form, the severity of each code, sorting and the terminal form |
| `formats/json-position` | `jsonPointerPosition`: the line and column a JSON pointer names in a file |

## Diagnostics

Every problem is one object with these keys, always present and in this order:

```json
{ "code": "BLOCKS_PACK_INVALID", "severity": "error", "file": "components/quiz/quiz.json", "line": 5,
  "column": 7, "component": "quiz", "field": "/fields/1/type", "message": "…", "fix": "…" }
```

`severity` is `error` (blocks a code release), `warning` (reported, never blocking) or `info` (a note). The
terminal form is `file:line:col severity CODE [component] [field]: message`, with the fix on the next line.
For a JSON file `field` is a JSON pointer into it; for a YAML file, a field path.
