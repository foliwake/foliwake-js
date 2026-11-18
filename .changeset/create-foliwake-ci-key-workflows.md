---
'create-foliwake': minor
---

The starter's GitHub workflows deploy with the open CLI instead of an SSH forced command: production runs
`npx @foliwake/cli@<version> code deploy`, branch previews `branch update` / `branch delete`, with the repository
variable `FOLIWAKE_SERVER` and the secret `FOLIWAKE_TOKEN` (a CI key from `foliwake account keys create --site`).
The CLI version is pinned exactly in the new project's `package.json` `devDependencies`. The SSH secrets, the
`foliwake-request` action and `foliwake-report.py` are gone, and so is the rollback workflow (a CI key cannot roll
back; an admin does it in the Foliwake admin or with `foliwake release rollback`). After `npm install`, the pinned
CLI is first on `npm run`'s PATH: run `foliwake dev` and `foliwake page check` directly (the README says so);
`npm run stories` skips it.
