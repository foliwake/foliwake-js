---
"@foliwake/site-check": minor
---

New package. `@foliwake/site-check/formats/*`: the rules of the files a site's code repository holds, moved out
of the Foliwake engine with the same behaviour, as modules without Node imports (the platform's origin and edge
Worker import them): constants, code file types, the layout of site code (`CODE_ROOTS`, `CODE_ROOT_FILES`,
`isCapturedInput`, `REQUIRED_FILES`, `GENERATED_FILES`, `ENGINE_RELEASE_FILES`, `CODE_LIMITS`), the strict YAML
reader, `site.yaml`, `query.yaml` (`foliwake-query/1`), `access.yaml`, page templates (`foliwake-templates/1`),
the component descriptor, the diagnostic form (with a third severity, `info`) and `jsonPointerPosition`.
`parseSiteConfig`, `parseQueryConfig` and `parseAccessConfig` report problems as `{ line, column, field, message }`.
