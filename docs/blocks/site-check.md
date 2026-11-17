# Check a site's code

`@foliwake/site-check` holds the checks the platform runs on a site's code repository.
The platform runs exactly this code before its own steps.
So a problem found locally has the same code, message and fix as on the server.

It checks block definitions, page templates, `site.yaml`, `query.yaml`, `access.yaml`, reference tables,
the component descriptor, the layout of the code folders and the imports of scripts and stylesheets.
It does not render pages or block examples.

## Run it

```sh
npx @foliwake/site-check            # the current folder
npx @foliwake/site-check my-site    # another folder
```

`pnpm dlx`, `yarn dlx` and `bunx` work the same way.
It reads the folder the way the platform captures a commit of it, including files you have not committed yet.

```text
@foliwake/site-check 0.3.0 — site code in . (HTML contract 2)
components/quiz/quiz.json:5:7 error BLOCKS_PACK_INVALID quiz /fields/1/type: Unknown field type "choice".
    fix: Use one of: text, heading, list, choices, quote, image.
17 files would be captured (components/, scripts/, …, site.yaml): 1 error, 0 warnings, 0 notes.
```

Every problem has a code, a place (`file:line:column`), a message and a fix.

## Exit status

| Status | Means |
| --- | --- |
| `0` | no errors (warnings and notes are allowed) |
| `1` | errors; with `--strict`, warnings too |
| `2` | a usage error, or the folder does not exist |

## Options

| Option | What |
| --- | --- |
| `--strict` | warnings fail the run too |
| `--quiet` | only the problems and the summary line |
| `--format text` | the default, for a terminal |
| `--format github` | one GitHub Actions annotation per problem, then the summary line |
| `--json`, `--format json` | one JSON object, schema `foliwake-site-check/1` |

Severities: `error` blocks a code release, `warning` is reported but never blocks,
`info` (a note in text form) is for your information.

## In GitHub Actions

`create-foliwake` writes this workflow for you (`.github/workflows/frontend-checks.yml`).
Pin the version, so CI checks with the same rules every time:

```yaml
name: Frontend checks
on: [pull_request, push]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npx -y @foliwake/site-check@0.3.0 . --format github
```

With `--format github`, each problem shows as an annotation on the line of the file in the pull request.

## As a library

```ts
import { checkSiteCode, formatDiagnostic, hasErrors } from '@foliwake/site-check';

const result = await checkSiteCode('.');
for (const diagnostic of result.diagnostics) console.log(formatDiagnostic(diagnostic));
process.exitCode = hasErrors(result.diagnostics) ? 1 : 0;
```

`checkCodeRelease(files)` checks files you already hold in memory (a `Map` of path → bytes).
The [reference](/reference/packages/site-check) lists the finer entry points and the format modules.

## What passes here and still fails on the platform

The platform also renders.
It can refuse a commit for what only rendering shows:
a page or a block example whose content does not fit the block's fields.
Push a branch and open its preview to see those.
