// @foliwake/client: show Foliwake pages in any browser app, without a framework (docs/plan/react-packages.md
// §4.3, §12.3). Framework adapters (@foliwake/react, a Vue or Svelte component, a web component) wrap
// mountFoliwakePage. DOM only; importing it on a server is safe (nothing touches the DOM before a call).
export {
  mountFoliwakePage, pageIdentity, pageStylesheets, HOOK_PHASES,
  type FoliwakeHooks, type FoliwakePhaseHooks, type FoliwakeHook, type FoliwakeHookContext, type FoliwakeHookPhase,
  type FoliwakeMount, type FoliwakeMountOptions, type FoliwakeMountCallbacks, type FoliwakePageStatus, type FoliwakePageError,
} from './mount.js';
export { listenBlockEvents, subscribeBlockEvents, BLOCK_EVENT_TYPES, type FoliwakeEventHandlers } from './events.js';
export { createHost, HOST_CONTRACT_MINOR, type CreatedHost, type HostInit } from './host.js';
export { importBlocksModule } from './load.js';
export { ensureImportMap, pageImportMap } from './import-map.js';
export { acquireCss, cssMounts } from './css-registry.js';
export type {
  BlockEventDetail, BlockEvents, BlockEventType, BlockHost, BlocksModule, ContractVersion, FoliwakeEvent, HostCore, MountHandle, MountReport, MountStatus,
} from '@foliwake/blocks-contract';
export type { ClientSettings, FoliwakePageData } from '@foliwake/blocks-contract/page';
