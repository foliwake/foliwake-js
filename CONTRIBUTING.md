# Contributing

- Work on a branch and open a pull request into `main`; `main` is only changed through pull requests (the first
  import of the history excepted). CI (`.github/workflows/ci.yml`) must pass: build, typecheck, tests, tarball
  hygiene and `npm publish --dry-run`.
- Never use `[skip ci]` (or any other skip marker) on a commit that lands on `main`: a release tag points at a
  `main` commit, and every such commit must have been checked.
- Before pushing: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`. When a public export or its
  TSDoc changes, run `pnpm packages:reference` and commit the regenerated README section.
- A change that users see gets a line in the package's `CHANGELOG.md` under the next version; breaking changes
  are marked **BREAKING**. The five packages keep one shared version.
- Dependencies are pinned exactly (`test/packages-dist.test.js` checks it); `pnpm-lock.yaml` is committed.
- No secrets, `.env` files, local paths or internal host names in commits or packages; the tarball hygiene
  check refuses them in what is published.
- The packages talk to a Foliwake origin over HTTP only. Tests that need a real Foliwake engine live in the
  engine repository and run there against the published packages; tests here use stub origins.
