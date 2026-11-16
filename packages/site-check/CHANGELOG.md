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
  - Diagnostics have a third severity, `info`, for notes that are never problems (`CODE_PATH_IGNORED`).
