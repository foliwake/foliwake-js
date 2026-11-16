#!/usr/bin/env node
// The packages of this repository, in build and publish order (each after the packages it depends on), with
// their npm names: the one list that the build, pack, version and tarball tools, the tests and both workflows
// read. They share one version and are released together.
//
//   node tools/packages.mjs                       the folder names
//   node tools/packages.mjs --names               the npm names
//   node tools/packages.mjs --tarballs <version>  the tarball file names of that version
// Each prints one item per line, in publish order (the workflows loop over them).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Folder under packages/ and npm name of each package, in build and publish order. */
export const PACKAGES = Object.freeze([
  { dir: 'blocks-contract', name: '@foliwake/blocks-contract' },
  { dir: 'site-check', name: '@foliwake/site-check' },
  { dir: 'client', name: '@foliwake/client' },
  { dir: 'react', name: '@foliwake/react' },
  { dir: 'server', name: '@foliwake/server' },
  { dir: 'next', name: '@foliwake/next' },
]);

/** The folder names in build and publish order. */
export const PUBLISH_ORDER = Object.freeze(PACKAGES.map((p) => p.dir));

/** The file `npm pack` / `pnpm pack` writes for a package name and version. */
export function tarballName(name, version) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

function listed(args) {
  if (args[0] === '--names') return PACKAGES.map((p) => p.name);
  if (args[0] === '--tarballs' && args[1]) return PACKAGES.map((p) => tarballName(p.name, args[1]));
  if (args.length === 0) return PUBLISH_ORDER;
  throw new Error('usage: node tools/packages.mjs [--names | --tarballs <version>]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(listed(process.argv.slice(2)).join('\n'));
  } catch (error) {
    console.error(`packages: ${error.message}`);
    process.exit(2);
  }
}
