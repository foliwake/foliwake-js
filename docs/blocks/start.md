# Start a site's code

A Foliwake site keeps its frontend code in a Git repository: blocks, styles and a small loader.
`create-foliwake` writes one for you, checked with the platform's own rules before anything is written.

## Create the repository

```sh
npm create foliwake@latest my-site
cd my-site
```

`pnpm create foliwake my-site`, `yarn create foliwake my-site` and `bun create foliwake my-site` work too.
In a terminal it asks for what you left open. Useful options:

| Option | What |
| --- | --- |
| `--template minimal` | one page, one block (`note`); the default |
| `--template examples` | two pages, three blocks, one with JavaScript (`quiz`) |
| `--react` | React vendored in `scripts/vendor/`, and a React example block (`poll`) |
| `--storybook` | Storybook for the blocks (needs the Foliwake CLI to render them) |
| `--no-git` | no Git repository and no first commit |

Everything comes with the package: no network, except installing Storybook's packages when you ask for it.
The [`create-foliwake` reference](/reference/packages/create-foliwake) has every option and exit status.

## What you get

```text
components/<name>/     one folder per block: <name>.json, <name>.css, optionally <name>.js and <name>.example.md
scripts/components.js  the loader: loads each block's CSS and JS on the pages that use it
styles/styles.css      styles of every page
site.yaml              site settings (authoring dialect)
content/               local sample pages (not published from this repository)
tests/                 quick checks of the vendored scripts and workflows
.github/               checks, branch previews and production workflows (inert until connected)
```

There is no build step.
The files in `components/`, `scripts/` and `styles/` are what the browser loads.

## Check it

```sh
npx @foliwake/site-check
node --test "tests/*.test.mjs"
```

`@foliwake/site-check` is the code the platform runs first on every commit.
A clean result here means the platform will not refuse your code for the same reasons.
See [Check a site's code](/blocks/site-check) for the CLI, exit codes and CI use.

## What needs the platform

The SDK does not render pages or block examples. Only the platform does.

| Want to | Without the Foliwake CLI | With it (not public yet) |
| --- | --- | --- |
| See a page with your blocks | push a branch, open its branch preview | `foliwake dev --watch` |
| See every block's examples | the block catalog on the preview | `/_dev/blocks` locally |
| Check pages and examples | the platform does it on every commit | `foliwake page check` |
| Get types of each block's own fields | not available yet | `foliwake dev` writes them |
| Storybook | not available yet | `npm run stories` |

## Connect it to your site

1. Push the repository to GitHub.
2. In the Foliwake admin, connect it to your site. You get the site id and two deployment keys.
3. Set the GitHub environments, variables and branch protection that the project's `README.md` lists.

Then:

- a pushed branch gets a branch preview with that branch's code;
- a merge into `main` becomes a code release, and every page is rebuilt with it in the preview;
- the release reaches live automatically when every page builds, or by **Release** in the admin.

Next: build two blocks hands-on in the [tutorial](/blocks/tutorial), or read [Write a block](/blocks/write-a-block).
