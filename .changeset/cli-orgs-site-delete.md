---
'@foliwake/cli': minor
'@foliwake/core-contract': minor
---

Organisations and site deletion: `foliwake org list`, `foliwake org create <id> [--name]` (the installation's owner;
core `org.create`) and `foliwake site delete --site <id> [--confirm <id>] [--force]` (core `sites.delete`: refused
while the site works, has live pages or is named by memberships, invitations or CI keys; its bucket is kept and the
command says how to go on).

`site create`, `connect --create` and `create --create-site` never leave the organisation to the server: `--org`, or
the only organisation where the account may create sites (said), or asked in a terminal when there are several
(refused without one, listing them). `connect --create` gets `--org` and `--repository`; the repository defaults to
the folder's Git `origin` as an https:// address (`--repository none`: none). The "Next steps" after a new site no
longer mention SSH secrets: a public repository needs no code token, a private one a read token; the workflows take
a CI key made with `account keys create --site <id> --label github-actions`.

The core contract adds `org.create` and `sites.delete` and their error codes.
