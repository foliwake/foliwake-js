// @foliwake/block-kit: the types of the kit (block-kit.ts) and of the blocks contract it speaks, so a block author
// installs one package: `import { defineBlock, html, readFields, type BlockHost } from '@foliwake/block-kit'`.
// The kit's own `BlockInit` (what `defineBlock` returns, with its name and contract) keeps its name; the
// contract's `BlockInit` is `ContractBlockInit` here. The package's `.` entry runs block-kit.js: this module
// only gives it its declarations (index.d.ts).
export * from './block-kit.js';
export type {
  BlockEventDetail,
  BlockEventType,
  BlockEvents,
  BlockHandle,
  BlockHost,
  BlockInit as ContractBlockInit,
  BlockLabels,
  BlocksContractName,
  BlocksModule,
  ChannelName,
  ContractVersion,
  CoreEventDetails,
  FoliwakeEvent,
  HostCore,
  HostReact,
  KnownShell,
  MountHandle,
  MountReport,
  MountStatus,
} from '@foliwake/blocks-contract';
export type * from '@foliwake/blocks-contract/assessment';
