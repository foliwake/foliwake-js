# {{name}}

The frontend of a Foliwake site: blocks, styles and a few local pages to work with. Created with `create-foliwake` {{createVersion}} (template `{{template}}`).

```text
components/<name>/     one folder per block: <name>.json (its fields), <name>.css, optionally <name>.js and <name>.example.md
scripts/components.js  the loader: loads each block's CSS and JS on the pages that use it
styles/styles.css      styles of every page
site.yaml              site settings for the engine (authoring dialect)
content/               local Markdown pages to develop against (not published by this repository)
tests/                 quick checks of the vendored scripts and workflows (node --test "tests/*.test.mjs")
foliwake.config.json   local configuration for the Foliwake CLI (`foliwake dev`); unused without it
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

The Foliwake CLI (with the Docker image or Foliwake Cloud) adds a local preview and the page checks:

```bash
foliwake dev --watch
```

Open http://127.0.0.1:3000/. Edit a page in `content/`, a block or a stylesheet and save: the browser reloads. `dev` uses only local files; no server, store or account is needed. Every block and its examples are on http://127.0.0.1:3000/_dev/blocks: each example rendered with your CSS and JavaScript, its HTML and its problems. Authors see the same examples as a block catalog at `/_foliwake/blocks` on the preview.{{storybookNote}}

`foliwake page check` checks every page and block example too. Run it in this folder: the CLI finds `foliwake.config.json` here by itself; after cloning the repository or changing the file, read it and run `foliwake config trust` once (it decides where credentials are sent).

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
2. Add `components/<name>/<name>.css` (and `<name>.js` if it needs JavaScript: its default export is `init(root, host, meta)`, best made with block-kit: `import { defineBlock, html } from 'foliwake'` and `defineBlock('<name>', (fields, ctx) => …)`, `jsconfig.json` gives your editor the types of `foliwake` and of your blocks, which `foliwake dev` writes to `.foliwake/types/`). With the Foliwake CLI, `foliwake blocks new <name> --js --example` writes all the files.
3. Use it in a page:

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

- **Push a branch** → the branch preview `https://<branch>--<site>.<branch host domain>/` shows the site's pages with that branch's code. Deleting the branch removes its preview.
- **Merge into `main`** → the checks run, the server prepares a code release from exactly that commit and rebuilds every page with it in the site's **preview**. Live does not change.
- **Release** → review the preview, then release it in the Foliwake admin: *Frontend → New code → Release*. A rollback is in the same place, or in GitHub: *Actions → Frontend production → Run workflow*.

## Connect to Foliwake

The workflows in `.github/workflows/` do nothing until the repository is connected. The "Frontend checks" workflow runs on every push and pull request from the start; it needs no secrets.

1. Push this repository to GitHub.
2. In the Foliwake admin, connect the repository to your site (or ask the operator of your Foliwake server to): it needs the clone URL and gives you the **site id** and the SSH keys of the two deployment commands (branch previews and production){{siteIdNote}}.
3. In the GitHub repository settings:
   - **Environments**: `branch-previews` with the secrets `BRANCH_PREVIEW_SSH_KEY`, `BRANCH_PREVIEW_KNOWN_HOSTS`, `BRANCH_PREVIEW_SSH_TARGET`; `production` (deployment branches: `main` only) with `PRODUCTION_DEPLOY_SSH_KEY`, `PRODUCTION_DEPLOY_KNOWN_HOSTS`, `PRODUCTION_DEPLOY_SSH_TARGET`.
   - **Variables**: `FOLIWAKE_SITE_ID` = the site id; `BRANCH_PREVIEWS_ENABLED` = `true` to turn on branch previews; `FRONTEND_PRODUCTION_DEPLOY_ENABLED` = `true` to turn on main → preview → live (with the site setting `codeRelease: auto`, the default, a merge to main is released when every page builds without problems; with `manual` it waits for Release in the admin); optionally `FOLIWAKE_PREVIEW_URL` and `FOLIWAKE_PRODUCTION_URL` (shown as links in GitHub).
   - **Branch protection** for `main`: require the "frontend-checks" status check.

Each variable switches on one workflow, so you can enable branch previews first and production later. The keys only reach the server's fixed deployment commands: the branch-preview key can update branch previews of this one site; the production key can deploy the tip of `main` (released only when the server's checks pass, or kept in preview with `codeRelease: manual`) and roll back; it cannot release any other preview.

## Content

The pages in `content/` are local sample content for development. The site's real content lives in its content source on the Foliwake server (Markdown, Google Docs, Drupal, …), not in this repository.
