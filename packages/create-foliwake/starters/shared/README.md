# {{name}}

The frontend of a Foliwake site: blocks, styles and a few local pages to work with. Created with `create-foliwake` {{createVersion}} (template `{{template}}`).

```text
components/<name>/     one folder per block: <name>.json (its fields), <name>.css, optionally <name>.js and <name>.example.md
scripts/components.js  the loader: loads each block's CSS and JS on the pages that use it
styles/styles.css      styles of every page
site.yaml              site settings for the engine (no default dialect: each page names its own)
content/               local Markdown pages to develop against (not published by this repository)
tests/                 quick checks of the vendored scripts and workflows (node --test "tests/*.test.mjs")
foliwake.config.json   the project for `foliwake dev` and `page check`: the code and content/, nothing else
.github/               checks, branch previews and production (inert until connected)
```

There is no build step: the files in `components/`, `scripts/` and `styles/` are what the browser loads.{{reactNote}}

## Develop

### Without the Foliwake CLI

Check the code with the platform's own rules after every change:

```bash
npx @foliwake/site-check
node --test "tests/*.test.mjs"
```

`@foliwake/site-check` checks everything about the code that needs no rendering: block definitions, templates, `site.yaml`, the layout of the folders and the references of scripts and stylesheets. The platform runs the same checks first, so its messages are the same. The pages and the block examples are rendered by the platform: push a branch and open its preview (below).

### With the Foliwake CLI

The server commands of the Foliwake CLI are open: `npm i -g @foliwake/cli` (sign-in, sites, code, branches, keys).
The local preview and the page checks need the Foliwake engine's `foliwake` (the same command with the engine
added), which is not public yet. Where you have it:

```bash
foliwake dev --watch
```

Open http://127.0.0.1:3000/. Edit a page in `content/`, a block or a stylesheet and save: the browser reloads. `dev` uses only local files; no server, store or account is needed. Every block and its examples are on http://127.0.0.1:3000/_dev/blocks: each example rendered with your CSS and JavaScript, its HTML and its problems. Authors see the same examples as a block catalog at `/_foliwake/blocks` on the preview.{{storybookNote}}

`foliwake page check` checks every page and block example too. Run it in this folder: the CLI finds `foliwake.config.json` here by itself. The file names only the code and `content/`, so it needs no `foliwake config trust`; a file that names storage, credentials or remote addresses does (it decides where credentials are sent).

### Add a block

1. Create `components/<name>/<name>.json` with its fields, for example a title and text:

   ```json
   {
     "label": { "en": "Tip" },
     "fields": [
       { "name": "title", "type": "heading", "level": 3, "min": 0 },
       { "name": "text", "type": "text", "max": null }
     ]
   }
   ```

   Field types: `heading`, `text`, `list`, `choices`, `quote`, `image`.
2. Add `components/<name>/<name>.css` (and `<name>.js` if it needs JavaScript: its default export is `init(root, host, meta)`, best made with block-kit: `import { defineBlock, html } from '@foliwake/block-kit'` and `defineBlock('<name>', (fields, ctx) => …)`; the page maps that import to the kit of the code release, so nothing is installed. `jsconfig.json` gives your editor the kit's types (`.foliwake/types/foliwake.d.ts`, from `@foliwake/block-kit`, written by create) and, with the Foliwake CLI, of your blocks (`foliwake dev` writes them to `.foliwake/types/blocks/`)). With the Foliwake CLI, `foliwake blocks new <name> --js --example` writes all the files.
3. Use it in a page (a page with blocks names its dialect in its front matter: `authoring: blocks-v3`):

   ```md
   :::tip

   ### A title

   Some text.

   :::
   ```

4. Show it in `components/<name>/<name>.example.md`: a line `<!-- example: Title -->` before each example, then the block as an author writes it. The examples appear in the authors' block catalog on the preview, on `/_dev/blocks` and in `foliwake blocks render` (fragments for Storybook); the platform renders them like pages.

The engine binds the content to the fields by their order and type and reports an error when the content does not fit, instead of guessing.

## Preview a change before it is live

The code that a Foliwake server publishes is always a **commit**. Commit your work first:

```bash
git add -A && git commit -m "Describe the change"
```

With the repository connected to your site (below):

- **Push a branch** → the branch preview `https://<branch>--<site>--<org>.<branch host domain>/` shows the site's pages with that branch's code. Deleting the branch removes its preview.
- **Merge into `main`** → the checks run, the server prepares a code release from exactly that commit and rebuilds every page with it in the site's **preview**. Live does not change.
- **Release** → review the preview, then release it in the Foliwake admin: *Frontend → New code → Release*. A rollback is in the same place (or `foliwake release rollback`, by an admin of the site).

## Connect to Foliwake

The workflows in `.github/workflows/` do nothing until the repository is connected. The "Frontend checks" workflow runs on every push and pull request from the start; it needs no secrets.

1. Push this repository to GitHub.
2. Link this folder to your site: `foliwake connect` (or `foliwake site create <id> --repository <clone URL>`, by an admin of your organisation). The server fetches the commits CI names from the repository over HTTPS: a public one needs nothing more; a private one needs a read token stored on the server, `foliwake credential set <SITE>__CODE_TOKEN --from-stdin`. This gives you the **site id**{{siteIdNote}}.
3. Create a CI key of the site: `foliwake account keys create --site <site id> --label <pipeline> --server <server address>` (the label says where the key is used, e.g. `github-actions`). It can deploy code and update branch previews of this one site; it cannot publish pages or roll back.
4. In the GitHub repository settings:
   - **Environments**: `branch-previews` and `production` (deployment branches: `main` only), each with the secret `FOLIWAKE_TOKEN` = the CI key.
   - **Variables**: `FOLIWAKE_SERVER` = the server's address (e.g. `https://foliwake.example.com`); `FOLIWAKE_SITE_ID` = the site id; `BRANCH_PREVIEWS_ENABLED` = `true` to turn on branch previews; `FRONTEND_PRODUCTION_DEPLOY_ENABLED` = `true` to turn on main → preview → live (with the site setting `codeRelease: auto`, the default, a merge to main is released when every page builds without problems; with `manual` it waits for Release in the admin); optionally `FOLIWAKE_PREVIEW_URL` and `FOLIWAKE_PRODUCTION_URL` (shown as links in GitHub).
   - **Branch protection** for `main`: require the "frontend-checks" status check.

Each variable switches on one workflow, so you can enable branch previews first and production later.

### The CLI version of the workflows

The workflows run the open Foliwake CLI with `npx @foliwake/cli@<version>`, outside the checkout (so only `FOLIWAKE_SERVER` picks the server). The version is the exact one in the `foliwake.cli` field of `package.json`, set by create to its own release:

```json
"foliwake": { "cli": "{{createVersion}}" }
```

Update it there; the workflows refuse anything but an exact version (`1.2.3`, no range). It is deliberately not a `devDependency`: `npm run` puts `node_modules/.bin` first on PATH, and an installed `@foliwake/cli` (server commands only, no local preview) would replace your own `foliwake` in `npm run dev` and `npm run check:pages`. On your machine, install a CLI globally instead: `npm i -g @foliwake/cli` for the server commands (`foliwake account keys create`, `branch update`, …), or the Foliwake CLI described in "Develop" for the local preview and page checks.

To let [Renovate](https://docs.renovatebot.com/) bump the field, add a custom manager to `renovate.json`:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "customManagers": [
    {
      "customType": "regex",
      "description": "The Foliwake CLI the workflows run: package.json foliwake.cli",
      "managerFilePatterns": ["/(^|/)package\\.json$/"],
      "matchStrings": ["\"foliwake\"\\s*:\\s*\\{[^}]*\"cli\"\\s*:\\s*\"(?<currentValue>[^\"]+)\""],
      "depNameTemplate": "@foliwake/cli",
      "datasourceTemplate": "npm"
    }
  ]
}
```

With `enabledManagers` set, add `"custom.regex"` to it.

## Content

The pages in `content/` are local sample content for development. The site's real content lives in its content source on the Foliwake server (Markdown, Google Docs, Drupal, …), not in this repository.
