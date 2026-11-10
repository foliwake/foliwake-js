// The runtime import of a code release's blocks module. The URL is same-origin (the app's code proxy) and
// known only at run time, so bundlers must leave the import() alone: the magic comments below are kept in
// dist/ (removeComments: false; test/packages/packages-dist.test.js asserts it).
import type { BlocksModule } from '@foliwake/blocks-contract';

export function importBlocksModule(url: string): Promise<BlocksModule> {
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ url) as Promise<BlocksModule>;
}
