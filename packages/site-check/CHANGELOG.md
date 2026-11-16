# Changelog: @foliwake/site-check

`@foliwake/site-check` shares one version with the other packages of this repository and is released together
with them. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

## 0.3.0 (unreleased)

- First release. The rules the Foliwake platform applies to a site's code repository, moved out of the engine
  with the same behaviour, so a site can be checked without a Foliwake server and the platform runs the same
  code:
  - `@foliwake/site-check/formats/*`, modules without Node imports (the platform's origin and edge Worker import
    them): constants, code file types, the layout of site code (`CODE_ROOTS`, `CODE_ROOT_FILES`,
    `isCapturedInput`, `REQUIRED_FILES`, `GENERATED_FILES`, `ENGINE_RELEASE_FILES`, `CODE_LIMITS`), the strict
    YAML reader, `site.yaml`, `query.yaml` (`foliwake-query/1`), `access.yaml`, page templates
    (`foliwake-templates/1`), the component descriptor, the diagnostic form and `jsonPointerPosition`.
  - `parseSiteConfig`, `parseQueryConfig` and `parseAccessConfig` report problems as
    `{ line, column, field, message }` instead of one string per problem.
  - The Node layer: block definitions (`blocks/pack`, `blocks/authoring-keys`, `blocks/extras`,
    `blocks/editor-config`), the JSON Schema of a block definition (`blocks/schema`), block example files
    (`blocks/examples`), reference tables (`references/tables`), link URL safety (`urls`), the site code reader
    (`site-code`: `siteCodeOf`, `readSiteCode`, `directoryTree`, `filesTree`), the descriptor check
    (`descriptor-check`) and the reference scan of scripts and stylesheets (`code-references`).
  - `checkCodeRelease(files)` over the captured files of a code release and `checkSiteCode(dir)` over a working
    folder read the way a capture reads a commit. Both return sorted diagnostics, the site code, `query.yaml`,
    `access.yaml`, the captured files and the ignored ones.
  - The site code reader reports diagnostics (`SiteCode.diagnostics`) instead of `issues` with a pointer: the
    pointer is the diagnostic's `field`, its position in the file the `line` and `column`.
  - New codes: `CODE_FILE_REQUIRED`, `CODE_FILE_GENERATED`, `CODE_REFERENCE_NOT_RELATIVE`,
    `CODE_REFERENCE_OUTSIDE`, `CODE_REFERENCE_MISSING`, `CODE_PATH_IGNORED` (info), `CODE_FOLDER_NAME_INVALID`,
    `CODE_FILE_TOO_LARGE` and `CODE_RELEASE_TOO_LARGE` (warnings for now: 2 MiB per file, 30 MiB and 2000 files
    per release), `QUERY_CONFIG_INVALID` and `ACCESS_CONFIG_INVALID` with a line, column and field.
  - The CLI `foliwake-site-check` (`npx @foliwake/site-check [dir]`): text, `--json` (schema
    `foliwake-site-check/1`) or `--format github` (Actions annotations), `--strict`, `--quiet`; exit status 0
    (no errors), 1 (errors; warnings too with `--strict`), 2 (usage).
  - License and notice files next to code (`scripts/vendor/react.LICENSE.txt`, `LICENSE`, `NOTICE.md`) are
    not captured and not noted.
  - Diagnostics have a third severity, `info`, for notes that are never problems (`CODE_PATH_IGNORED`).
