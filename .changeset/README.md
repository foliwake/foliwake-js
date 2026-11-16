# Changesets

Every pull request that changes a package adds a changeset: `pnpm changeset` (pick the packages, the bump and
write what changed for their users); a change that users never see (tests, docs, tooling) adds an empty one:
`pnpm changeset --empty`. All packages share one version (`fixed` in `config.json`). See CONTRIBUTING.md and the
README's "Releasing".
