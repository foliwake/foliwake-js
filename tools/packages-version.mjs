#!/usr/bin/env node
// Prints the one version of the five app packages (they are released together) and exits non-zero when they
// differ, when it is not 0.x, or when a release tag is given that names another version.
//
//   node tools/packages-version.mjs [v<version>]
//
// Used by .github/workflows/publish.yml before packing and again before publishing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The app packages in publish order: each after the packages it depends on. */
const PUBLISH_ORDER = ['blocks-contract', 'client', 'react', 'server', 'next'];

function versionOf(name) {
  return JSON.parse(readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8')).version;
}

function sharedVersion() {
  const versions = new Set(PUBLISH_ORDER.map(versionOf));
  if (versions.size !== 1) throw new Error(`the five packages differ: ${[...versions].join(', ')}; bump them together`);
  const [version] = versions;
  if (!/^0\.\d+\.\d+$/.test(version)) throw new Error(`version ${version}: 0.x only while the packages are 0.x`);
  return version;
}

function checkTag(tag, version) {
  if (tag !== undefined && tag !== `v${version}`) {
    throw new Error(`tag ${tag} does not name the packages' version ${version} (expected v${version})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const version = sharedVersion();
    checkTag(process.argv[2], version);
    console.log(version);
  } catch (error) {
    console.error(`packages-version: ${error.message}`);
    process.exit(1);
  }
}
