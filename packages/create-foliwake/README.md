# create-foliwake

<!-- usage -->

Creates the code repository of a Foliwake site: blocks, styles, a few local sample pages, quick tests and the
GitHub workflows that connect it to the platform.

```sh
npm create foliwake@latest my-site
npx create-foliwake@latest my-site
pnpm create foliwake my-site
yarn create foliwake my-site
bun create foliwake my-site
```

In a terminal it asks for what the options leave open (folder, template, React, Storybook, whether to install
Storybook's packages, Git). Without a terminal, or with `--no-interactive`, it uses the defaults: folder
`foliwake-site`, template `minimal`, no React, no Storybook, a Git repository with a first commit.

| Option | What |
| --- | --- |
| `[folder]` | the new project's folder (default `foliwake-site`; `.` for the current folder) |
| `--template minimal\|examples` | `minimal`: one page, one block; `examples`: two pages, three blocks, one with JavaScript |
| `--site <id>` | the site id on your Foliwake server, if you know it (used in the README and local configuration) |
| `--react` / `--no-react` | React and ReactDOM vendored in `scripts/vendor/` (shipped with this package; nothing is downloaded) and a React example block |
| `--storybook` / `--no-storybook` | Storybook for the blocks; `npm run stories` needs the Foliwake CLI |
| `--install` / `--no-install` | install the npm packages (only Storybook has any) with the package manager that ran create |
| `--git` / `--no-git` | a Git repository (branch `main`) and a first commit with your own Git identity |
| `--overwrite` \| `--keep-existing` | the folder is not empty: remove its files (`.git` is kept), or add the project next to them |
| `--interactive` / `--no-interactive` | ask for missing values (default: only in a terminal) |

Exit status: `0` created; `1` a step failed (the project stays; what to do is printed); `2` refused input
(nothing written); `130` cancelled (nothing written).

## What it guarantees

- Nothing is written before every check passed: the planned files are checked with
  [`@foliwake/site-check`](https://www.npmjs.com/package/@foliwake/site-check), the checks the platform runs, and
  must be clean (no errors, warnings or notes).
- The files are written as one transaction: on a failure nothing of the run stays, and `--overwrite` puts the
  original files back. Nothing is written through a symbolic link, Git metadata is never a destination, and a
  folder holding other repositories is never cleared.
- No network: the starters, React and the checker come with the package. The only download is installing
  Storybook's packages, and only when you ask for it.
- The first commit stages only the project's files and uses your Git identity; inside an existing repository
  no repository is created.

## The project

Without anything installed: `npx @foliwake/site-check` checks the code (the "Frontend checks" workflow runs it,
pinned to the version this package was released with), and `node --test "tests/*.test.mjs"` runs the quick
tests. Push the repository to GitHub and connect it to your site in the Foliwake admin: every branch gets a
preview. The Foliwake CLI adds a local preview (`foliwake dev --watch`) and the page checks; it writes the block
types for editors (`.foliwake/types/`). The project's `README.md` has the details.

## API

`createProject(request, io)` is the same run without printing, for a wrapper that adds its own steps (the
Foliwake CLI's `foliwake create`); `printResult` and `nextSteps` print its result. `create-foliwake/starters`
gives the starter files (`starterFile(layer, path)`, `layerFiles`, `vendoredReact`).
