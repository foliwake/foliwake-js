// createHost with React's default shell ('react'); everything else is @foliwake/client's createHost.
import type { BlockHost } from '@foliwake/blocks-contract';
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';
import { createHost as createClientHost, type HostInit } from '@foliwake/client';

/** `createHost` of `@foliwake/client` with the shell `'react'` when the app names none. */
export function createHost(init: HostInit | (() => HostInit), base: { signal: AbortSignal; page: FoliwakePageData }): BlockHost {
  return createClientHost(init, { shell: 'react', ...base });
}
