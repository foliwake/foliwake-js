// Static checks of the deployment workflows (run: node --test "tests/*.test.mjs"). They pin
// down what keeps them safe: both deployment workflows stay inert until their
// own repository variable is `true`, branch previews and production use
// separate environments, production runs only from main after the checks,
// nothing with secrets runs for pull requests or forks, the only secret is the
// CI key FOLIWAKE_TOKEN, the CLI is the version pinned in package.json
// `foliwake.cli` (not a dependency), run outside the checkout, and every
// action is pinned to a commit SHA.
// Text-based (no YAML dependency).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const files = { checks: read('frontend-checks.yml'), preview: read('branch-preview.yml'), production: read('production.yml') };

// Job blocks: `  <id>:` lines directly under `jobs:`.
function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n') + 7);
  const out = {};
  let current = null;
  for (const line of body.split('\n')) {
    const match = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (match) {
      current = match[1];
      out[current] = '';
    } else if (current) out[current] += `${line}\n`;
  }
  return out;
}

test('no workflow uses pull_request_target, write permissions or unpinned actions', () => {
  for (const [name, text] of Object.entries(files)) {
    assert.doesNotMatch(text, /pull_request_target/, name);
    assert.match(text, /^permissions:\n  contents: read\n/m, `${name}: read-only token`);
    assert.doesNotMatch(text, /:\s*write\b/, `${name}: no write permission`);
    for (const [, ref] of text.matchAll(/uses:\s*(\S+)/g)) {
      if (ref.startsWith('./')) continue;
      assert.match(ref, /@[0-9a-f]{40}$/, `${name}: ${ref} pinned to a commit SHA`);
    }
  }
});

test('frontend checks use no secrets (safe for fork pull requests) and run the tests', () => {
  assert.doesNotMatch(files.checks, /secrets\./);
  assert.match(files.checks, /^  pull_request:\s*$/m);
  assert.match(files.checks, /node --test "tests\/\*\.test\.mjs"/);
});

/** A job that calls the server: the pinned CLI, outside the checkout, with the server and key from GitHub. */
function assertServerCall(job, id, command) {
  const pick = /version=\$\(node -p "require\('\.\/package\.json'\)\.foliwake\?\.cli"\)\n/;
  assert.match(job, pick, `${id}: the CLI version comes from package.json foliwake.cli`);
  assert.match(job, /\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/, `${id}: an exact version only`);
  assert.match(job, new RegExp(`npx --yes "\\$FOLIWAKE_CLI" ${command} .*--site "\\$SITE" .*--json`), `${id}: ${command}`);
  assert.match(job, /working-directory: \$\{\{ runner\.temp \}\}/, `${id}: runs outside the checkout`);
  assert.match(job, /FOLIWAKE_SERVER: \$\{\{ vars\.FOLIWAKE_SERVER \}\}/, `${id}: the server is a variable`);
  assert.match(job, /RUN_ID/, `${id}: ordering sequence from the run id`);
  for (const [, secret] of job.matchAll(/secrets\.([A-Z0-9_]+)/g)) assert.equal(secret, 'FOLIWAKE_TOKEN', `${id}: ${secret}`);
}

test('the project pins the Foliwake CLI the workflows run, exactly, outside its dependencies', () => {
  assert.match(manifest.foliwake?.cli ?? '', /^[0-9]+\.[0-9]+\.[0-9]+$/);
  // A dependency would put its `foliwake` (server commands only) first on `npm run`'s PATH.
  for (const deps of [manifest.dependencies, manifest.devDependencies]) {
    assert.equal(deps?.['@foliwake/cli'], undefined, '@foliwake/cli is not a dependency');
  }
});

test('branch previews: inert until BRANCH_PREVIEWS_ENABLED, own environment, never main', () => {
  const text = files.preview;
  assert.match(text, /^  push:\n    branches-ignore: \[main\]\n  delete:\n/m);
  assert.doesNotMatch(text, /workflow_dispatch|pull_request/);
  assert.doesNotMatch(text, /PRODUCTION/);
  const all = jobs(text);
  assert.deepEqual(Object.keys(all).sort(), ['delete', 'preview']);
  for (const [id, job] of Object.entries(all)) {
    assert.match(job, /vars\.BRANCH_PREVIEWS_ENABLED == 'true'/, `${id}: enablement guard`);
    assert.match(job, /vars\.FOLIWAKE_SITE_ID != ''/, `${id}: needs the site id`);
    assert.match(job, /!github\.event\.repository\.fork/, `${id}: not in forks`);
    assert.match(job, /(github\.ref_name|github\.event\.ref) != 'main'/, `${id}: never main`);
    assert.match(job, /^    environment: branch-previews$/m, `${id}: environment`);
  }
  assertServerCall(all.preview, 'preview', 'branch update "\\$BRANCH"');
  assertServerCall(all.delete, 'delete', 'branch delete "\\$BRANCH"');
});

test('production: inert until FRONTEND_PRODUCTION_DEPLOY_ENABLED, main only, after the checks, deploy only', () => {
  const text = files.production;
  assert.match(text, /^  push:\n    branches: \[main\]\n/m);
  assert.doesNotMatch(text, /workflow_dispatch/, 'no rollback from CI: a CI key cannot roll back');
  const all = jobs(text);
  assert.deepEqual(Object.keys(all).sort(), ['checks', 'deploy']);
  assert.match(all.checks, /uses: \.\/\.github\/workflows\/frontend-checks\.yml/);
  const job = all.deploy;
  assert.match(job, /^    needs: checks$/m, 'deploy needs the checks');
  assert.match(job, /vars\.FRONTEND_PRODUCTION_DEPLOY_ENABLED == 'true'/, 'own enablement guard');
  assert.doesNotMatch(job, /BRANCH_PREVIEWS_ENABLED/, 'not the branch-preview guard');
  assert.match(job, /github\.ref == 'refs\/heads\/main'/, 'main only');
  assert.match(job, /!github\.event\.repository\.fork/, 'not in forks');
  assert.match(job, /^    environment:\n      name: production$/m, 'production environment');
  assertServerCall(job, 'deploy', 'code deploy');
  assert.match(job, /--rev "\$SHA"/, 'exactly the pushed commit');
  const steps = Object.values(all).join('');
  assert.doesNotMatch(steps, /release rollback|promote/, 'only the server decides a release, for the commit it deployed');
});
