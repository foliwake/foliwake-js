'use client';
// @foliwake/react: show Foliwake pages in a React app (docs/plan/react-packages.md §4.3).
export { FoliwakePage, type FoliwakePageProps, type FoliwakePageStatus, type FoliwakePageError } from './foliwake-page.js';
export { useFoliwakeEvents, listenBlockEvents, BLOCK_EVENT_TYPES, type FoliwakeEventHandlers } from './events.js';
export { createHost, HOST_CONTRACT_MINOR, type HostInit } from './host.js';
export { FoliwakeProvider, useFoliwakeSettings } from './settings.js';
export { cssMounts } from './css-registry.js';
export type {
  Answer, BlockEventDetail, BlockEventType, BlockHost, BlockReport, BlocksModule, ContractVersion, FoliwakeEvent, MountHandle, SavedAnswer, Verdict,
} from '@foliwake/blocks-contract';
export type { ClientSettings, FoliwakePageData } from '@foliwake/blocks-contract/page';
