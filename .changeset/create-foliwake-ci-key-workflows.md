---
'create-foliwake': minor
---

The starter's GitHub workflows deploy with the open CLI instead of an SSH forced command: production runs
`npx @foliwake/cli@<version> code deploy`, branch previews `branch update` / `branch delete`, with the repository
variable `FOLIWAKE_SERVER` and the secret `FOLIWAKE_TOKEN` (a CI key from `foliwake account keys create --site`).
The CLI version is pinned exactly in the new project's `package.json` field `"foliwake": { "cli": "<version>" }`
(create's own release); the workflows read it and refuse anything but an exact version. It is not a
`devDependency`, so `npm install` never puts a `foliwake` into `node_modules/.bin` that would shadow the developer's
own CLI in `npm run dev`, `check:pages` or `stories` (install a CLI globally: `npm i -g @foliwake/cli`, or the
engine CLI). The README shows a Renovate custom regex manager that bumps the field. The SSH secrets, the
`foliwake-request` action and `foliwake-report.py` are gone, and so is the rollback workflow (a CI key cannot roll
back; an admin does it in the Foliwake admin or with `foliwake release rollback`).
