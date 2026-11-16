// The release tooling: one list of packages (tools/packages.mjs) for every tool and workflow, one shared version,
// release candidates published under the npm dist-tag `next`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { PACKAGES, PUBLISH_ORDER, tarballName } from '../tools/packages.mjs';
import { VERSION_PATTERN, distTag, sharedVersion } from '../tools/packages-version.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

test('the list names every folder under packages/, each after the packages it depends on', () => {
  const folders = readdirSync(path.join(ROOT, 'packages')).filter((name) => !name.startsWith('.')).sort();
  assert.deepEqual([...PUBLISH_ORDER].sort(), folders);
  assert.match(read('tools/build.mjs'), /BUILD_ORDER = PUBLISH_ORDER/);
  for (const [index, { dir, name }] of PACKAGES.entries()) {
    const manifest = JSON.parse(read(`packages/${dir}/package.json`));
    assert.equal(manifest.name, name);
    const internal = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }).filter((dep) =>
      PACKAGES.some((p) => p.name === dep),
    );
    for (const dep of internal) {
      assert.ok(PACKAGES.findIndex((p) => p.name === dep) < index, `${name} is published after ${dep}`);
    }
  }
});

test('the workflows take the packages from the list, never a copy of it', () => {
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/publish.yml']) {
    const text = read(file);
    assert.match(text, /node (\.\.\/)?tools\/packages\.mjs --tarballs/, file);
    assert.doesNotMatch(text, /blocks-contract client/, file);
  }
});

test('one shared version: final 0.x.y or a release candidate 0.x.y-rc.N; candidates go to `next`', () => {
  assert.match(sharedVersion(), VERSION_PATTERN);
  for (const ok of ['0.3.0', '0.3.0-rc.1', '0.12.4-rc.10']) assert.match(ok, VERSION_PATTERN);
  for (const bad of ['1.0.0', '0.3', '0.3.0-beta.1', '0.3.0-rc', 'v0.3.0']) assert.doesNotMatch(bad, VERSION_PATTERN);
  assert.equal(distTag('0.3.0'), 'latest');
  assert.equal(distTag('0.3.0-rc.2'), 'next');
  assert.equal(tarballName('@foliwake/site-check', '0.3.0-rc.1'), 'foliwake-site-check-0.3.0-rc.1.tgz');
  assert.equal(tarballName('create-foliwake', '0.3.0'), 'create-foliwake-0.3.0.tgz');
});

test('changesets: one fixed group of exactly the packages; every workflow action pinned to a commit', () => {
  const config = JSON.parse(read('.changeset/config.json'));
  assert.deepEqual([...config.fixed[0]].sort(), PACKAGES.map((p) => p.name).sort());
  assert.equal(config.fixed.length, 1);
  assert.equal(config.access, 'public');
  assert.equal(config.baseBranch, 'main');
  for (const file of ['ci.yml', 'publish.yml', 'release.yml']) {
    const text = read(`.github/workflows/${file}`);
    for (const [, action] of text.matchAll(/^\s*(?:- )?uses: ([^\s#]+)/gm)) {
      if (action.startsWith('./')) continue;
      assert.match(action, /@[0-9a-f]{40}$/, `${file}: ${action} is pinned to a commit SHA`);
    }
  }
});

test('publish.yml hands npm a file path, never a bare "dir/file" (npm reads that as a GitHub repository)', () => {
  const publish = read('.github/workflows/publish.yml');
  const commands = publish.match(/npm publish "[^"]+"/g) ?? [];
  assert.ok(commands.length > 0, 'publish.yml runs npm publish');
  for (const command of commands) {
    const target = command.slice('npm publish "'.length, -1);
    assert.match(target, /^(\.\/|\$RUNNER_TEMP\/|\/)/, `${command} must start with ./, / or $RUNNER_TEMP/`);
  }
});

test('release.yml publishes through publish.yml, never with a copy of its steps', () => {
  const release = read('.github/workflows/release.yml');
  assert.match(release, /uses: \.\/\.github\/workflows\/publish\.yml/);
  assert.match(release, /commit-message: Version packages$/m, 'the version commit carries no skip marker');
  // changesets/action 2.x names its outputs in kebab case; a camelCase name reads as empty and skips the tag.
  assert.match(release, /steps\.changesets\.outputs\.has-changesets == 'false'/, 'the tag step reads has-changesets');
  assert.doesNotMatch(release, /outputs\.hasChangesets/, 'no camelCase output names of changesets/action');
  assert.doesNotMatch(release, /npm publish/);
  assert.match(read('.github/workflows/publish.yml'), /^  workflow_call:$/m);
  assert.match(read('.github/workflows/ci.yml'), /pnpm changeset status --since="origin\/\$BASE_REF"/);
});
