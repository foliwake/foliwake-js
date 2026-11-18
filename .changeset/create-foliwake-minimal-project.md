---
'create-foliwake': minor
---

A new project's `foliwake.config.json` is a minimal project file: the site id, `code.root` and the local `content/`
source, without `storage`, `stateDir` or hosts (the engine defaults them for a local project). It names no
address and no credential, so `foliwake config trust` is not needed for it.

The starter's `site.yaml` no longer sets `authoring: blocks-v3` as the site's default dialect: a site with a Drupal
or Google Docs source refuses that default (their pages cannot be written in blocks-v3), so every code preparation
failed once such a source was added. The starter's pages name `authoring: blocks-v3` in their front matter instead.

README: branch preview addresses with `--<org>` (`<branch>--<site>--<org>.<branch host domain>`), the open
`@foliwake/cli` for the server commands (the local preview still needs the engine), `account keys create` with its
required `--label`, and the repository step as `foliwake connect` / `site create --repository` (a public
repository needs no code token).
