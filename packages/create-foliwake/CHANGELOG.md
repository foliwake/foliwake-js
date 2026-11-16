# Changelog: create-foliwake

`create-foliwake` shares one version with the `@foliwake/*` packages of this repository and is released together
with them. While the version is 0.x, a minor release may break; breaking changes are marked **BREAKING**.

## 0.3.0 (unreleased)

- First release: `npm create foliwake@latest` (and `npx`, `pnpm`, `yarn`, `bun create`). The create command of
  the Foliwake CLI, moved out of the engine without its server step: the same starters (now inside this
  package), questions, flags and write guarantees, plus `--install` for Storybook's packages.
- The planned project is checked with `@foliwake/site-check` before anything is written; the generated
  "Frontend checks" workflow runs `npx @foliwake/site-check@<version> . --format github`, and the project's
  `tests/` keep only what the checker does not cover.
- React for the starters is vendored when the package is built (`vendor/react.js` and its license).
- `createProject()` and `create-foliwake/starters` for the Foliwake CLI's `foliwake create` wrapper.
