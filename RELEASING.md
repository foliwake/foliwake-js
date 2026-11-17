# Releasing

The owner releases; agents never tag or publish.

- Registry: npm (`https://registry.npmjs.org`), public, scope `@foliwake` (npm organisation `foliwake`).
  `publishConfig` is `{ "access": "public", "provenance": true }`; no custom registry.
- Tag format: **`v<version>`** (for example `v0.3.0`): one tag for all packages, which share a version. A
  release candidate `v0.3.0-rc.1` is published under the npm dist-tag `next` (never `latest`); a final version
  under `latest` (`tools/packages-version.mjs --dist-tag`).
- Versions and changelogs: [Changesets](https://github.com/changesets/changesets). Every pull request that
  changes a package adds a changeset (`pnpm changeset`; CONTRIBUTING.md). All packages are one `fixed` group
  (`.changeset/config.json`): they always get the same version.
- Workflows:
  - [`release.yml`](.github/workflows/release.yml), on every push to `main`: while changesets are pending, it
    opens or updates the pull request **"Version packages"** (`changesets/action`): the next shared version in
    every `package.json`, the changesets' entries in every `CHANGELOG.md`. When that pull request is merged
    (no changeset left) and the version is neither tagged nor on npm, it tags the merge commit `v<version>` and
    calls `publish.yml` with the tag.
  - [`publish.yml`](.github/workflows/publish.yml), the one publish path (called by `release.yml`, or run by
    the push of a tag `v<version>` or a dispatch):
    - `pack` (no token, `contents: read`): checks that the versions are one 0.x version equal to the tag
      (`tools/packages-version.mjs`), builds, typechecks, runs the tests, packs the tarballs with `pnpm pack`
      (which rewrites `workspace:*` to the exact version), installs exactly those files into a throwaway
      consumer and uses them, checks their hygiene (`tools/check-package-tarballs.mjs` with
      `tools/package-tarball-hygiene.mjs`: only whitelisted files; no credentials files or secrets, no local
      paths, no internal hosts, no source maps, no private names from `FOLIWAKE_PRIVATE_NAMES`, no references
      to private history), runs `npm publish --dry-run` on each tarball and uploads them with their checksums.
    - `publish` (only for a tag): runs in the GitHub environment `packages-publish` (the owner's approval;
      `contents: read`, `id-token: write` for provenance), refuses a private repository, checks that the tag
      points at the checked commit on `main`, refuses a version that exists, and publishes exactly the checked
      tarballs (checksums) in dependency order with `npm publish --provenance --access public --tag <dist-tag>`
      and the secret `NPM_TOKEN`. The package list and order: `tools/packages.mjs`.
  - Dry run: Actions → "Publish" → Run workflow on `main` with `dry-run` checked (the default); it runs `pack`
    only. Locally: `pnpm check:tarballs`, then `npm publish .tarballs/<tarball> --dry-run`.
- To release: review and merge the "Version packages" pull request (update the compatibility table of `README.md` in it
  when it changes, and run `pnpm packages:reference`), then approve the `publish` job. A pull request opened
  with the workflow token starts no CI run by itself: close and reopen it (or push a commit to it) so the
  required `CI` check runs.
- Release candidates: in a pull request, `pnpm changeset pre enter rc` (writes `.changeset/pre.json`); the
  "Version packages" pull request then gives `0.x.y-rc.N`, published under the npm dist-tag `next`, never
  `latest`. `pnpm changeset pre exit` in a later pull request returns to final versions. Without Changesets, a
  tag `v<version>` pushed by the owner on a `main` commit with that version still publishes it.
- Owner setup (once, before the first publish):
  1. npm: in the `foliwake` organisation, a **granular access token** with read and write on packages, limited
     to the `@foliwake` scope and the unscoped package `create-foliwake` (which the first publish creates; a
     token limited to the scope cannot publish it), with a short expiry (renew before a release). Alternative:
     npm trusted publishing (OIDC) for this repository and `publish.yml`, which needs no token; the workflow
     would then drop `NODE_AUTH_TOKEN`.
  2. GitHub: Settings → Environments → `packages-publish`: required reviewer = the owner, deployment branches
     and tags = selected: tag rule `v*` and branch rule `main` (release.yml calls publish.yml from `main`); the
     token as the environment secret **`NPM_TOKEN`**. Settings → Rules: a tag ruleset on `v*` that lets only the
     owner and the GitHub Actions app (release.yml tags releases) create such tags and nobody update or delete
     them, and a branch ruleset on `main` (pull requests, the `CI` check required). Settings → Actions →
     General: allow GitHub Actions to create pull requests (the "Version packages" pull request).
