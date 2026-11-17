# Contributing

- Work on a branch and open a pull request into `main`; `main` is only changed through pull requests (the first
  import of the history excepted). CI (`.github/workflows/ci.yml`) must pass: the changeset check, build,
  typecheck, tests, tarball hygiene and `npm publish --dry-run`.
- Never use `[skip ci]` (or any other skip marker) on a commit that lands on `main`: a release tag points at a
  `main` commit, and every such commit must have been checked.
- Before pushing: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`. When a public export or its
  TSDoc changes, run `pnpm packages:reference` and commit the regenerated README section.
- Every pull request that changes a package adds a changeset: `pnpm changeset` (choose the packages and the bump,
  write what changes for their users; breaking changes start with **BREAKING**). A change users never see (tests,
  docs, tooling inside a package) adds an empty one: `pnpm changeset --empty`. CI fails a pull request that
  changes `packages/**` without a changeset. `CHANGELOG.md` files are written from the changesets by the
  "Version packages" pull request; do not edit their entries by hand. The packages keep one shared version
  (`tools/packages.mjs` lists them; `fixed` in `.changeset/config.json`).
- Dependencies are pinned exactly (`test/packages-dist.test.js` checks it); `pnpm-lock.yaml` is committed.
- No secrets, `.env` files, local paths or internal host names in commits or packages; the tarball hygiene
  check refuses them in what is published.
- The packages talk to a Foliwake origin over HTTP only. Tests that need a real Foliwake engine live in the
  engine repository and run there against the published packages; tests here use stub origins.
- `@foliwake/block-kit`: the kit is written in TypeScript (`packages/block-kit/src/block-kit.ts`, its public
  types included); tsc compiles it to one readable ES2023 module whose only import is the dynamic one of the
  vendored `./lit-html.js`, kept as `dist/block-kit.debug.js`. `dist/block-kit.js`, the file the engine copies
  as it is into every code release, is its minified copy (`tools/minify-kit.mjs`, Terser): the same exports and
  behaviour, and the URL `./lit-html.js` as written; the browser tests run against it. No source map is shipped
  (the tarball check refuses them); read or step through the debug copy instead. The declarations are
  generated (`block-kit.d.ts`, `index.d.ts`; the standalone `foliwake.d.ts` by `tools/block-kit-declaration.mjs`).
  `lit-html.js` is vendored JS, copied as written. `src/lit-html.d.ts` types the kit's import of lit-html.
