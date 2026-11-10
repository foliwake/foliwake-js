'use client';
// @foliwake/react: show Foliwake pages in a React app (docs/plan/react-packages.md §4.3). A thin wrapper of
// @foliwake/client, which holds the lifecycle; this package adds the component, the hook and the context.
export { FoliwakePage, type FoliwakePageProps } from './foliwake-page.js';
export { useFoliwakeEvents } from './events.js';
export { createHost } from './host.js';
export { FoliwakeProvider, useFoliwakeSettings } from './settings.js';
export {
  listenBlockEvents, BLOCK_EVENT_TYPES, HOST_CONTRACT_MINOR, cssMounts,
  type FoliwakeEventHandlers, type FoliwakePageStatus, type FoliwakePageError, type HostInit, type FoliwakeHooks,
} from '@foliwake/client';
export type {
  Answer, BlockEventDetail, BlockEventType, BlockHost, BlockReport, BlocksModule, ContractVersion, FoliwakeEvent, MountHandle, SavedAnswer, Verdict,
} from '@foliwake/blocks-contract';
export type { ClientSettings, FoliwakePageData } from '@foliwake/blocks-contract/page';
