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
prints the approval address; without a server it asks for one in a terminal). The token is kept in the macOS Keychain or the Linux Secret Service (a 0600 file
only with `--insecure-storage`); the list of servers, without secrets, is `~/.config/foliwake/servers.json`
(`FOLIWAKE_CONFIG_DIR` moves it). These are the same places the engine's own `foliwake` uses, so a sign-in made
with either works for both. `foliwake logout` revokes the token on the server and forgets it here;
`foliwake whoami` shows the server, your account and what it may do.

You can be signed in to several servers. The first sign-in becomes the default server of commands that name
none; a later `login` keeps the default unless you pass `--default`. `foliwake servers` lists the servers with
their account and organisations (`*` marks the default, `--json` for scripts); `foliwake servers use <server>`
changes the default.

## Which server a command calls

1. `--server <origin or host>`;
2. the server of this folder's `.foliwake/connection.json` (written by `site create` and `site link`), whose
   site is also the default for `--site`;
3. `FOLIWAKE_SERVER`;
4. the server of the last `login`.

Without any of these a command stops and says so. Unlike the engine's CLI, nothing runs locally:
`FOLIWAKE_CONFIG` and `foliwake.config.json` are not read, and `--config` or `--content` answer that they need
the engine.

## CI

Create a CI key on the server (`foliwake account keys create`), then set `FOLIWAKE_SERVER` and
`FOLIWAKE_TOKEN` in the job. The key is sent only to `FOLIWAKE_SERVER`, never to a server another flag names.

## Compatibility

The CLI speaks core over HTTP as `@foliwake/core-contract` describes it, and names itself to the server in
`X-Foliwake-Cli`. A server older than the CLI answers `PROCEDURE_UNKNOWN` for an operation it does not have; the
CLI then says to update the server or use an older `@foliwake/cli`. `GET /api/version` on the server names its
engine and contract.

## Limits

- No command renders or stores content locally: `dev` without `--remote`, `blocks render`, `serve`, `server`,
  `api serve`, `admin`, `docker …`, `config trust`, `account bootstrap|invite|link` need the engine.
- `--timings` (phase timings of the engine) is not available here.
