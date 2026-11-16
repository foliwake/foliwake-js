// Static checks of the deployment workflows (run: node --test "tests/*.test.mjs"). They pin
// down what keeps them safe: both deployment workflows stay inert until their
// own repository variable is `true`, branch previews and production use
// separate environments and secrets, production runs only from main after the
// checks, nothing with secrets runs for pull requests or forks, and every
// action is pinned to a commit SHA. Text-based (no YAML dependency).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
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

test('branch previews: inert until BRANCH_PREVIEWS_ENABLED, own environment and secrets, never main', () => {
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
    for (const [, secret] of job.matchAll(/secrets\.([A-Z0-9_]+)/g)) assert.match(secret, /^BRANCH_PREVIEW_/, `${id}: ${secret}`);
    assert.match(job, /RUN_ID/, `${id}: ordering sequence from the run id`);
  }
});

test('production: inert until FRONTEND_PRODUCTION_DEPLOY_ENABLED, main only, after the checks, production secrets only', () => {
  const text = files.production;
  assert.match(text, /^  push:\n    branches: \[main\]\n/m);
  assert.doesNotMatch(text, /secrets\.BRANCH_PREVIEW/);
  const all = jobs(text);
  assert.match(all.checks, /uses: \.\/\.github\/workflows\/frontend-checks\.yml/);
  assert.match(all.deploy, /^    needs: checks$/m, 'deploy needs the checks');
  assert.match(all.deploy, /"action": "deploy"/, 'a push deploys main: the server prepares it and, with codeRelease auto, releases it when its checks pass');
  assert.doesNotMatch(text, /promote|"action": "release"/, 'no request names a release: only the server decides one, for the commit it deployed');
  for (const id of ['deploy', 'rollback']) {
    const job = all[id];
    assert.match(job, /vars\.FRONTEND_PRODUCTION_DEPLOY_ENABLED == 'true'/, `${id}: own enablement guard`);
    assert.doesNotMatch(job, /BRANCH_PREVIEWS_ENABLED/, `${id}: not the branch-preview guard`);
    assert.match(job, /github\.ref == 'refs\/heads\/main'/, `${id}: main only`);
    assert.match(job, /!github\.event\.repository\.fork/, `${id}: not in forks`);
    assert.match(job, /^    environment:\n      name: production$/m, `${id}: production environment`);
    for (const [, secret] of job.matchAll(/secrets\.([A-Z0-9_]+)/g)) assert.match(secret, /^PRODUCTION_DEPLOY_/, `${id}: ${secret}`);
  }
  assert.match(all.rollback, /expect/, 'a rollback names the live release it expects');
});
