#!/usr/bin/env node
// Prints the one version of the packages (they are released together) and exits non-zero when they differ, when
// it is not 0.x (a final 0.x.y or a release candidate 0.x.y-rc.N), or when a release tag is given that names
// another version.
//
//   node tools/packages-version.mjs [v<version>]              the version
//   node tools/packages-version.mjs --dist-tag [v<version>]   the npm dist-tag to publish it under:
//                                                             `next` for a release candidate, else `latest`
//
// Used by .github/workflows/publish.yml before packing and again before publishing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLISH_ORDER } from './packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A version the packages may have while they are 0.x: final, or a release candidate. */
export const VERSION_PATTERN = /^0\.\d+\.\d+(-rc\.\d+)?$/;

function versionOf(name) {
  return JSON.parse(readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8')).version;
}

export function sharedVersion() {
  const versions = new Set(PUBLISH_ORDER.map(versionOf));
  if (versions.size !== 1) throw new Error(`the packages differ: ${[...versions].join(', ')}; bump them together`);
  const [version] = versions;
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`version ${version}: 0.x.y or 0.x.y-rc.N only while the packages are 0.x`);
  }
  return version;
}

/** The npm dist-tag of a version: release candidates never become `latest`. */
export function distTag(version) {
  return version.includes('-rc.') ? 'next' : 'latest';
}

function checkTag(tag, version) {
  if (tag !== undefined && tag !== `v${version}`) {
    throw new Error(`tag ${tag} does not name the packages' version ${version} (expected v${version})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const wantsTag = args.includes('--dist-tag');
  const [tag] = args.filter((arg) => arg !== '--dist-tag');
  try {
    const version = sharedVersion();
    checkTag(tag, version);
    console.log(wantsTag ? distTag(version) : version);
  } catch (error) {
    console.error(`packages-version: ${error.message}`);
    process.exit(1);
  }
}
