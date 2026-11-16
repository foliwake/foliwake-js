---
"create-foliwake": minor
"@foliwake/site-check": minor
---

New package `create-foliwake`: `npm create foliwake@latest` (also `npx`, `pnpm`, `yarn` and `bun create`). The
create command of the Foliwake CLI without its server step: the starters (inside the package), questions, flags
and write guarantees, plus `--install` for Storybook's packages (the only network step). The planned project is
checked with `@foliwake/site-check` before anything is written; its "Frontend checks" workflow runs
`npx -y @foliwake/site-check@<version> . --format github`. React for the starters is vendored when the package is
built. The project gets the types of `foliwake` for editors (`.foliwake/types/foliwake.d.ts`, from
`@foliwake/block-kit`) and the JSON Schema of block definitions, both git-ignored. `createProject()` and
`create-foliwake/starters` for the Foliwake CLI's `foliwake create`.
`@foliwake/site-check`: license and notice files next to code (`scripts/vendor/react.LICENSE.txt`) are neither
captured nor noted.
