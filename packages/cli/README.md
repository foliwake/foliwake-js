# @foliwake/cli

The `foliwake` command without the Foliwake engine: sign in to a Foliwake server and run your site's commands
there. Nothing renders or stores content on your computer; the server does the work, as it does for the
dashboard.

```sh
npx @foliwake/cli login https://foliwake.example
npx @foliwake/cli whoami
```

Foliwake Cloud is not available yet: sign in to your own Foliwake server (the Docker package, or one your team
runs). The server name `cloud` is reserved for it.

Or install it: `npm i -g @foliwake/cli`, then `foliwake …`. Node.js 22.22 or later.

## Signing in

`foliwake login <server>` signs this computer in through the browser with a one-time code (`--no-browser` only
prints the approval address; without a server it asks for one in a terminal). The token is kept in the macOS
Keychain or the Linux Secret Service (a 0600 file only with `--insecure-storage`); the list of servers,
without secrets, is `~/.config/foliwake/servers.json`
(`FOLIWAKE_CONFIG_DIR` moves it). These are the same places the engine's own `foliwake` uses, so a sign-in made
with either works for both. `foliwake logout` revokes the token on the server and forgets it here;
`foliwake whoami` shows the server, your account and what it may do.

You can be signed in to several servers. The first sign-in becomes the default server of commands that name
none; a later `login` keeps the default unless you pass `--default`. `foliwake servers` lists the servers with
their account and organisations (`*` marks the default, `--json` for scripts); `foliwake servers use <server>`
changes the default.

## Commands

Each command calls one operation of the server and prints the same text and `--json` as the engine's own
`foliwake` for that command.

- `login`, `logout`, `whoami`, `servers`, `servers use`
- `connect`: link this folder to a new or an existing site
- `create [folder]`: a new site frontend (`create-foliwake`), then `--create-site` / `--link-site <id>` or, in
  a terminal, «Connect to a Foliwake server?»
- `site list | status | show | set | edit | history | adopt | reset-storage | create | link | unlink`
- `preview`, `publish [paths]` (= `project preview | publish` in a folder linked to a site), `project unpublish`
- `source list | sync | pending | plugins | adopt-pages | add | check | mappings check`
- `page check | changes | replace | unpreview | unpublish`
- `code prepare | release | deploy | rollback`, `release rollback`, `migration prepare | commit`
- `branch list | history | update | delete | bootstrap`
- `operation get | list | cancel | recover`
- `credential set | list | rm`
- `account keys create | list | revoke`
- `dev --remote [preview|live]`, `dev --remote-url <url>`: your blocks over a deployed site's pages

`foliwake <command> --help` describes each; `--debug` prints the underlying error. The full list with flags
is under [Command reference](#command-reference).

`foliwake connect` links a project folder to a site in one step: in a terminal it asks which server (signing
in when needed), then whether to create a new site (as `site create`, the folder name suggested as its id) or
link one you may develop (as `site link`); without a terminal, `--create <id>` or `--link <id>`. A folder that
is linked already is refused: `--force` replaces the link, `foliwake site unlink` removes it.

## Which server a command calls

1. `--server <origin or host>`;
2. the server of this folder's `.foliwake/connection.json` (written by `site create` and `site link`), whose
   site is also the default for `--site`;
3. `FOLIWAKE_SERVER`;
4. the default server (the first `login`, or the one `servers use` chose).

Without any of these a command stops and says so. Unlike the engine's CLI, nothing runs locally:
`FOLIWAKE_CONFIG` and `foliwake.config.json` are not read, and `--config` or `--content` answer that they need
the engine.

## CI

Create a CI key on the server (`foliwake account keys create`), then set `FOLIWAKE_SERVER` and
`FOLIWAKE_TOKEN` in the job. The key is sent only to `FOLIWAKE_SERVER`, never to a server another flag names.

## dev --remote

```sh
foliwake dev --remote --watch          # in the frontend checkout: preview content, this checkout's code
foliwake dev --remote live --port 3001
foliwake dev --remote-url https://preview.foliwake.example --remote-auth-user owner --remote-auth-env PREVIEW_PASSWORD
```

A local server on `http://127.0.0.1:3000/` shows the pages of the deployed preview (or, only when named, live)
site with the `components/`, `scripts/` and `styles/` of the folder it runs in. The endpoints come from the
secret-free `foliwake.remote.json` of the checkout (`--remote-config` names another file) or from
`--remote-url`; a Basic password is read from the environment variable the file or `--remote-auth-env`
names, at start, and is never printed. Each page is fetched when the browser asks for it: only its `<main>`,
`<title>`, description and language are kept and wrapped in a local page shell with the import map of the
block kit (`@foliwake/block-kit`, served from this package's installed copy). Deployed JavaScript and CSS are
never loaded. With `--watch`, open pages reload after a change to the local code and show the problems the
platform's checks (`@foliwake/site-check`) find in it.

## Inside the engine

The Foliwake engine (its checkout or Docker image) is the same `foliwake` command with this package as an oclif
plugin: it registers its local runtime with `registerLocalRuntime()` from `@foliwake/cli/local-runtime` before
oclif loads the commands. Then the same commands also run on that computer: `--server`, then `--config`, then
`FOLIWAKE_CONFIG` unless `FOLIWAKE_SERVER` is set, then `.foliwake/connection.json`, then `FOLIWAKE_SERVER`, then
`./foliwake.config.json`, then the default server, else the local configuration. An explicit `FOLIWAKE_SERVER`
thus reaches its server even where `FOLIWAKE_CONFIG` is set for the engine's own commands (its Docker image). `--config` and `--content` are shown and work, the engine
serves `dev` (local content, and `--remote` with its block catalog), `operation recover --break-lock` removes a
local state lock, and `--timings` reports the engine's phase timings. The hook is for the engine; its shape may
change with it.

## Compatibility

The CLI speaks core over HTTP as `@foliwake/core-contract` describes it, and names itself to the server in
`X-Foliwake-Cli`. A server older than the CLI answers `PROCEDURE_UNKNOWN` for an operation it does not have; the
CLI then says to update the server or use an older `@foliwake/cli`. `GET /api/version` on the server names its
engine and contract.

## Limits

- No command renders or stores content locally: `dev` without `--remote`, `blocks render`, `serve`, `server`,
  `api serve`, `admin`, `docker …`, `config trust`, `account bootstrap|invite|link` need the engine.
- `--config`, `--content`, `preview|publish --site`, and `operation recover --break-lock` (they act on a local
  configuration or state) answer that they need the engine.
- `--timings` prints only the total time; the phase timings are measured by the engine.
- `create` writes the project with `create-foliwake`; its texts are create-foliwake's, not the engine's own
  `create`. The server choice and sign-in questions are the same.
- Commands default waits to a 30 s settle delay, as the engine CLI does against a server (the server's own delay
  is not read).
- `dev` serves only remote content (`--remote`, `--remote-url`); serving local Markdown needs the engine.
- `dev --remote` has no block catalog: `/_dev/blocks` and `/_foliwake/blocks` answer 501 until the open block
  renderer exists (the engine's `foliwake dev` has it).
- `dev --remote` signs in to a protected site with HTTP Basic only, not with your `foliwake login`.
- `dev --remote` shows no content errors: the content is the deployed site's, checked when it was published.

## Command reference

<!-- commands -->

Every command also takes `--help`; those that call a server take `--server <origin or host>`, `--json`
and `--debug`.

### `foliwake account keys create`

Make a CI key: it may only deploy code and update branch previews of the named sites (role ci); shown once, kept as a
hash (core account.keys.create)

- `--label <value>`: what the key is for, e.g. the pipeline (shown in `account keys list`)
- `--org <value>`: the organisation of the sites (default: the only one you administer)
- `--site <value>`: a site the key may release code of (repeat for several)

### `foliwake account keys list`

Your signed-in computers and the CI keys of the organisations you administer; never a key itself (core account.keys.list
and account.keys.ci)

### `foliwake account keys revoke [key]`

Revoke a key at once: a CI key of an organisation you administer (ci_…), or one of your signed-in computers (key_…)
(core account.keys.revoke)

### `foliwake branch bootstrap`

Once: seed the default branch preview from live code; a no-op when it exists (core branches.bootstrap)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake branch delete [branch]`

Stop serving a branch preview (its hosts answer 404); its code and selection history stay (core branches.remove)

- `--expect <sel_…|none>`: the selection of the branch you saw (`branch list --json` shows it; `none`: the branch had no
  preview); refused when it is another one
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--latest-selection`: expect the branch's selection as it is now (read once, before the request)
- `--sequence <value>`: deployment ordering (a positive integer such as the CI run id), instead of --expect: refused as
  superseded when a request with a higher sequence already updated or deleted this branch
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake branch history [branch]`

Selection history of one branch (core branches.history)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake branch list`

Branches, their code and preview URLs (core branches.list)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake branch update [branch]`

Prepare code from a commit (or use --code) and show it in that branch preview; live is unchanged (core branches.update)

- `--code <value>`: an already prepared code release (cd_…) instead of preparing one
- `--expect <sel_…|none>`: the selection of the branch you saw (`branch list --json` shows it; `none`: the branch had no
  preview); refused when it is another one
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--latest-selection`: expect the branch's selection as it is now (read once, before the request)
- `--rev <value>`: the commit to prepare the code from, a branch, tag or full SHA (default HEAD)
- `--sequence <value>`: deployment ordering (a positive integer such as the CI run id), instead of --expect: refused as
  superseded when a request with a higher sequence already updated or deleted this branch
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake code deploy`

Deploy a commit of the site's frontend: prepare it, rebuild every page against it in preview and, with codeRelease auto,
release exactly that pair when its checks pass (core code.deploy). Its progress goes to stderr while it runs (one JSON
event per line with --json); `operation list` shows it too

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--rev <value>`: the full commit SHA to deploy
- `--sequence <value>`: deployment ordering, e.g. a CI run id; an older one than live code is not released
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake code prepare`

Copy JS/CSS from a clean commit into an immutable code release; on a site with a live release, live and preview are
unchanged. On a site without one it changes live: it makes release 1, this code and no pages, and waits for its cache
refresh (core code.prepare)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--rev <value>`: the Git revision to copy, a branch, tag or full SHA (default HEAD); the checkout must be clean
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--wait-timeout <value>`: limit of the wait for this write's cache refresh, in seconds (default: settle delay + 30 s);
  still pending then: exit 3, `operation recover` finishes it

### `foliwake code release [code]`

Make a prepared code release live code; pages stay as they are; refused when live is not the release you expected (core
code.release)

- `--expect <value>`: the live site release you saw (sr_…, as `site status` shows it); refused when live is another one
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--latest-live`: expect the live release as it is now (read once, before the request)
- `--rev <value>`: the commit the code was prepared from (full SHA), when it was prepared from several
- `--sequence <value>`: deployment ordering, e.g. a CI run id: refused as superseded when live code was released with a
  higher one
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--wait-timeout <value>`: limit of the wait for this write's cache refresh, in seconds (default: settle delay + 30 s);
  still pending then: exit 3, `operation recover` finishes it

### `foliwake code rollback [to]`

Make earlier live code live again; pages stay as they are; refused when live is not the release you expected (core
code.rollback)

- `--expect <value>`: the live site release you saw (sr_…, as `site status` shows it); refused when live is another one
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--latest-live`: expect the live release as it is now (read once, before the request)
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--wait-timeout <value>`: limit of the wait for this write's cache refresh, in seconds (default: settle delay + 30 s);
  still pending then: exit 3, `operation recover` finishes it

### `foliwake connect`

Link this project folder to a site on your Foliwake server: a new one or an existing one

- `--create <value>`: create this new site and link the folder to it
- `--force`: replace the link of a folder that is linked already
- `--interactive` / --no-interactive: ask for what the flags leave open (default: only when stdin and stdout are a
  terminal)
- `--link <value>`: link the folder to this existing site

### `foliwake create [folder]`

Create a new site frontend: blocks, styles, local pages, checks and workflows

- `--connect` / --no-connect: --no-connect: never ask «Connect to a Foliwake server?» (default: asked at the end in a
  terminal)
- `--create-site`: at the end, create the site (id: --site, else the folder name) on your server, as `site create`
- `--git` / --no-git: create a Git repository (branch main) and commit the project with your Git identity (default:
  yes); skipped inside an existing repository
- `--install` / --no-install: install Storybook's npm packages; default: asked in a terminal after Storybook, else no
- `--interactive` / --no-interactive: ask for missing values (default: only when stdin and stdout are a terminal)
- `--keep-existing`: the folder is not empty: add the project next to its files (refused if one would be replaced)
- `--link-site <value>`: at the end, link the project to this existing site on your Foliwake server, as `site link`
- `--overwrite`: the folder is not empty: remove its files first (.git is kept)
- `--react` / --no-react: add React support: React and ReactDOM vendored in scripts/vendor/ and the React example block
  poll; default: asked in a terminal, else no
- `--relink`: with --create-site or --link-site in a folder already linked elsewhere: replace that link
- `--site <value>`: the site id on your Foliwake server, if you know it (the README uses it); empty: none
- `--storybook` / --no-storybook: add Storybook for the blocks: .storybook/ and npm scripts; default: asked in a
  terminal, else no
- `--template <value>`: minimal: one page and one block (default); examples: two pages and three blocks, one with
  JavaScript

### `foliwake credential list`

Credentials the content sources use: set or not, from the environment or stored; never the value (core credentials.list)

- `--site <value>`: only the credentials this site's sources use (default: every site you administer)

### `foliwake credential rm [name]`

Removes a stored credential (the installation's owner); refused while a source uses it (core credentials.remove)

### `foliwake credential set [name]`

Stores a credential value on the server (the installation's owner): a source names it in `credentials`; the next sync
uses it without a restart. The value is read from a file or stdin, never from the command line (core credentials.set)

- `--from-file <value>`: read the value from this file (a Google service-account JSON key is checked)
- `--from-stdin`: read the value from standard input

### `foliwake dev`

Develop blocks against a deployed site: its content, this checkout’s code (dev --remote)

- `--port <value>`: port to listen on (default 3000)
- `--remote <[preview|live]>`: content from the deployed preview (default) or live site, local components/, scripts/ and
  styles/; endpoints from ./foliwake.remote.json. Live only when named; never a fallback
- `--remote-auth-env <NAME>`: with --remote-url: NAME of the environment variable holding the HTTP Basic password (never
  the password itself)
- `--remote-auth-user <value>`: with --remote-auth-env: the HTTP Basic user name
- `--remote-config <value>`: with --remote: another endpoints file than ./foliwake.remote.json (same format,
  secret-free)
- `--remote-url <value>`: remote mode with this site origin instead of foliwake.remote.json (https; http only for
  loopback)
- `--watch`: watch local components/, scripts/, styles/ and reload open browser pages after changes (one reload per
  burst of saves; problems are shown in the page until fixed). Without it, refresh by hand
- `--watch-polling` / --no-watch-polling: with --watch: detect code changes by polling file stats (default on macOS);
  --no-watch-polling: native file-system events (default elsewhere). Precedence: this flag, then
  FOLIWAKE_WATCH_POLLING=1|0, then CHOKIDAR_USEPOLLING, then the platform default

### `foliwake login [server]`

Sign this computer in to a Foliwake server through the browser (device code)

- `--browser` / --no-browser: open the approval page in the browser (--no-browser only prints its address)
- `--default`: make this server the default of other commands (the first sign-in always is)
- `--insecure-storage`: keep the token in a 0600 file when there is no system keychain

### `foliwake logout [server]`

Revoke this computer’s sign-in to a Foliwake server and forget its token

- `--forget-only`: forget the token here even when the server cannot revoke it (it then stays valid there until it
  expires)

### `foliwake migration commit`

Release the reviewed preview of new code: code and pages go live as one site release (core migration.commit)

- `--expect <value>`: the reviewed preview and its code, sr_…@cd_… (`site status` prints them)
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--sequence <value>`: deployment ordering, e.g. a CI run id; an older one than live code is refused
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake migration prepare [code]`

Rebuild every live page against prepared code as the preview; live is unchanged (core migration.prepare)

- `--add <value>`: pages that are not live and join the site with it (comma-separated IDs)
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--remove <value>`: live pages that leave the site with it (comma-separated IDs)
- `--rev <value>`: the commit the code was prepared from, recorded with the preview
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake operation cancel [id]`

Ask a long operation to stop: a queued one stops at once, a running one when it can (core operations.cancel)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake operation get [id]`

One long operation: its state, stage, delivery and result (core operations.get)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake operation list`

The latest long operations of a site, newest first (core operations.list)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--limit <value>`: how many (default 50)
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake operation recover`

Find out what happened to interrupted operations, finish the engine’s interrupted work and pending cache refreshes;
never runs an operation again (core operations.recover)

- `--break-lock`: remove a state lock left by a process that is gone (on the server: needs the engine there)
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--timings`: report the total time on stderr (one JSON line with --json); also FOLIWAKE_TIMINGS=1 (phase timings need
  the engine)
- `--wait`: also wait (bounded) for pending cache refreshes; those still pending then stay recorded and the exit status
  is 3
- `--wait-timeout <value>`: limit of --wait in seconds (default: settle delay + 90 s)

### `foliwake page changes`

Compare working pages (text and images) with the live site (core content.changes)

- `--changed`: list only pages that differ from the live site
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake page check`

Validate all pages and components/components.json (core content.validate)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake page replace`

Let another item of its source feed a published page (e.g. a Drive file deleted and uploaded again): the page keeps its
ID, address, live version and history. Shows the plan and asks first; preview and live are unchanged until the next sync
and preview/publish (core sources.replacePage)

- `--path <value>`: the path of the page that is live or in preview
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--with <value>`: the native ID of the source item that should feed it (a Drive file ID; `source sync --json` lists
  the items' native_id)
- `--yes`: apply the plan without asking (required when not in a terminal)

### `foliwake page unpreview`

Remove a page from the preview, live untouched: a page that is not live leaves the preview, a live page shows its live
version there again. Refused when the preview is not the one you expected (core channels.unpreview)

- `--expect <value>`: the preview site release you saw (sr_…, as `site status` shows it); refused when the preview is
  another one
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--latest-preview`: expect the preview as it is now (read once, before the request)
- `--path <value>`: the path of the page in the preview
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--wait-timeout <value>`: limit of the wait for this write's cache refresh, in seconds (default: settle delay + 30 s);
  still pending then: exit 3, `operation recover` finishes it

### `foliwake page unpublish [pages]`

Remove pages from the live site; refused when live is not the release you expected (core channels.unpublish)

- `--expect <value>`: the live site release you saw (sr_…, as `site status` shows it); refused when live is another one
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--latest-live`: expect the live release as it is now (read once, before the request)
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--wait-timeout <value>`: limit of the wait for this write's cache refresh, in seconds (default: settle delay + 30 s);
  still pending then: exit 3, `operation recover` finishes it

### `foliwake project preview`

Preview this project's pages on its site's server (a folder linked with site create / site link)

### `foliwake project publish [paths]`

Publish the pages your last preview changed (or the pages of the given files and folders) to live

- `--expect <value>`: the preview release you reviewed (sr_…); default: the one the last `foliwake preview` here made
- `--yes`: do not ask (scripts)

### `foliwake project unpublish [paths]`

Take the pages of the given files and folders off live

- `--expect <value>`: the live release you saw (sr_…); default: live as it is now
- `--yes`: do not ask (scripts)

### `foliwake release rollback [to]`

Make an earlier site release live again, code and pages as they were, as a new release; refused when live is not the
release you expected (core channels.rollback)

- `--expect <value>`: the live site release you saw (sr_…, as `site status` shows it); refused when live is another one
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--latest-live`: expect the live release as it is now (read once, before the request)
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--wait-timeout <value>`: limit of the wait for this write's cache refresh, in seconds (default: settle delay + 30 s);
  still pending then: exit 3, `operation recover` finishes it

### `foliwake servers`

List the Foliwake servers this computer is signed in to; * marks the default

### `foliwake servers use [server]`

Make a signed-in server the default of commands that name no server

### `foliwake site adopt`

Bind an existing bucket and its state to a configured site; publishes nothing (core sites.adopt)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake site create [id]`

Create this project's site on your Foliwake server (core sites.create; admin)

- `--code` / --no-code: send the last commit for release 1 (--no-code: release 1 waits for the first code prepare)
- `--org <value>`: the organisation (default: your only one where you are admin)
- `--relink`: replace the link of this folder (.foliwake/connection.json) to another server or site without asking
- `--repository <value>`: where the code will live, e.g. https://github.com/acme/mytest (the server checkout's origin)

### `foliwake site edit`

Edit a stored site's settings in $VISUAL or $EDITOR; saved only if nobody changed the site meanwhile (core sites.update)

- `--expect <value>`: the revision you saw (`site show`); default: the one opened in the editor
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake site history`

Who changed a stored site's settings, when, and which settings (core sites.history)

- `--limit <value>`: how many changes, newest first (default 20)
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake site link [id]`

Link this project folder to an existing site on your Foliwake server (developer or admin)

- `--relink`: replace the link of this folder (.foliwake/connection.json) to another server or site without asking

### `foliwake site list`

Configured sites with hosts, repositories and bindings (core sites.list)

### `foliwake site reset-storage`

Recreate a site's storage in one action: archive its state, delete its objects in its own bucket, bind both again,
prepare its code (release 1) and sync its sources. Publishes nothing: live is EMPTY (no pages) until you publish again.
Prints the plan first and asks for the site id (the installation's owner only; core sites.resetStorage)

- `--confirm <value>`: the site id, typed again: confirms the reset without a question (needed without a terminal)
- `--dry-run`: print the plan (what is lost, what is done) and change nothing
- `--rev <value>`: the commit to prepare again (default: the commit live code came from, else HEAD)
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake site set [path] [value]`

Change one setting of a stored site, only if nobody changed the site since it was read (core sites.update)

- `--expect <value>`: the revision you saw (`site show`); default: the one read just before the change
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--unset`: remove the setting instead of setting it

### `foliwake site show`

A site's stored settings and their revision, on a server that keeps its sites in a database (core sites.get)

- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake site status`

Live, preview, code and pending work at a glance (core sites.status)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake site unlink`

Remove this project folder's link to its site (.foliwake/connection.json); the server is not changed

- `--force`: also remove a .foliwake/connection.json this version cannot read

### `foliwake source add`

Adds a content source to a site: checks it first (settings, credentials, connection, files and their addresses), then
saves it after a confirmation; nothing is fetched (core sources.probe, sources.add)

- `--base-url <value>`: Drupal: the site address
- `--basic-password <value>`: Drupal: the credential name of its password
- `--basic-user <value>`: Drupal: the credential name of a read-only user name (HTTP Basic)
- `--branch <value>`: Git: the branch (default main)
- `--check-only`: check and print, save nothing
- `--display-name <value>`: the name the dashboard shows
- `--folder <value>`: Google Drive: the folder link or ID
- `--id <value>`: the new source id (lower case, digits, "-")
- `--identity <value>`: Google Drive: file-id (default; renames keep the page) or front-matter
- `--key <value>`: Google Drive: the credential name of the service-account key (default FOLIWAKE_GOOGLE_SA_KEY)
- `--language <value>`: Drupal: a language code, the default first (repeatable)
- `--mappings <value>`: a JSON file with path mapping rules (default: each file names its address)
- `--owns <value>`: a path the source owns, such as /lessons or "=/" (repeatable)
- `--plugin <value>`: the connector
- `--repository <value>`: Git: the https address of the repository
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--subfolder <value>`: Google Drive or Git: the folder inside that holds the pages
- `--token <value>`: Git: the credential name of a read-only token (private repository)
- `--yes`: save without asking (scripts)

### `foliwake source adopt-pages [source]`

Let a source take over published pages that no source owns yet (published by an earlier configuration: one folder), at
paths it owns; preview and live are unchanged (core sources.adoptPages)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake source check`

Checks content sources without changing anything: settings, credentials, the connection and, with --listing, the files
and the page addresses they would get (core sources.probe)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--listing`: also list the files and their page addresses (slower: reads the whole source)
- `--max <value>`: at most this many files in the listing (default 500)
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--source <value>`: one source of the site (default: every enabled source)

### `foliwake source list`

The site's content sources: plugin, owned paths and selected snapshot (core sources.list)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)

### `foliwake source mappings check`

Dry run of a source's path mappings over the documents it already has (the selected snapshot, or a working folder's
files): each document's page path now and with the rules, unmatched files and problems; reads no upstream and changes
nothing (core sources.mappingsCheck)

- `--file <value>`: check the rules in this JSON file (a list of rules) instead of the configured ones; needs --source
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--source <value>`: only this source (default: every source with path mappings)

### `foliwake source pending`

Edits waiting in the content sources that the selected snapshots do not have: a read-only check, nothing is fetched into
a snapshot or stored (core sources.pending)

- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--source <value>`: content source id of the site (see `source list`; default: every source)

### `foliwake source plugins`

Registered content-source plugins, their versions and the planned catalog (core sources.plugins)

### `foliwake source sync`

Read content sources into private snapshots and select them; preview and live are unchanged (core sources.sync)

- `--code <value>`: the prepared code of a migration: read and check the sources against it instead of live code
- `--full`: read every item of the source again (no incremental sync: unchanged items are not kept from the selected
  snapshot)
- `--input <value>`: raw JSON for the full operation input; overrides the other input flags
- `--site <value>`: site id (default: the site this folder is linked to, else the only site on the server)
- `--source <value>`: content source id of the site (see `source list`; default: every enabled source)
- `--timings`: report the total time on stderr (one JSON line with --json); also FOLIWAKE_TIMINGS=1 (phase timings need
  the engine)
- `--verbose`: also print codes, snapshots, attempts and the engine's technical text (for support)

### `foliwake whoami`

Show the server, who this command acts as and what it may do (core whoami)

<!-- commandsstop -->
