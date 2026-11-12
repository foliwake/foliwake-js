// createHost with React's default shell ('react'); everything else is @foliwake/client's createHost.
import type { FoliwakePageData } from '@foliwake/blocks-contract/page';
import { createHost as createClientHost, type CreatedHost, type HostInit } from '@foliwake/client';

/** `createHost` of `@foliwake/client` with the shell `'react'` when the app names none. */
export function createHost<Ext extends object = Record<never, never>>(init: HostInit<Ext> | (() => HostInit<Ext>), base: { signal: AbortSignal; page: FoliwakePageData }): CreatedHost<Ext> {
  return createClientHost<Ext>(init, { shell: 'react', ...base });
}
