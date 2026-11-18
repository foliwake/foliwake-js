---
'@foliwake/cli': minor
---

`source add`: `--list-title` (Drupal, per `--language`), `--plugin google-docs` with `--page <document link or
ID>=<path>` (repeatable) and an optional `--folder`, and `--allow-private-host <host>` (the source's
`operator.allowPrivateHosts`; the installation's owner only). A source whose connection check fails is no longer
saved unless `--force`. When another source owns the whole site (`/`), it prints how to narrow that one first.
`source check` checks a new source described with the same flags (`--id …`) without saving it.
