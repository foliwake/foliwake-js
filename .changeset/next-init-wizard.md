---
'@foliwake/next': minor
'@foliwake/cli': minor
---

`npx @foliwake/next init` (bin `foliwake-next`, no extra dependencies) sets up a Next app: checks the site
(discovery, `X-Code-Release` on `/index.plain.html`), writes `FOLIWAKE_URL` to `.env.local`, wraps `next.config` in
`withFoliwake()` (two ES module forms; otherwise it prints the steps), and adds `app/foliwake/[...path]/route.ts`
and `app/[...path]/page.tsx`. `--preview` adds a preview route behind a development-only `isAuthor()` and an empty
`FOLIWAKE_PREVIEW_TOKEN=`; `--hook`, `--mount /pages`, `--dry-run`, `--json`, `--force` (only files it generated),
`--yes` (or `CI=1`; needs `--url`), `--ignore-git-changes`, and `--check` to check an existing setup. Exit codes 0,
1 (error) and 2 (input needed); env equivalents `FOLIWAKE_INIT_*`. It never writes or prints a secret value.
`foliwake next init` in `@foliwake/cli` runs the same wizard.
