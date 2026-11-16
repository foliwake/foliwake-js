// @foliwake/block-kit: the types of the kit (foliwake.d.ts) and of the blocks contract it speaks, so a block author
// installs one package: `import { defineBlock, html, readFields, type BlockHost } from '@foliwake/block-kit'`.
// The kit's own `BlockInit` (what `defineBlock` returns) and `MountHandle` (of `ctx.mount`) keep their names; the
// contract's types of the same names are `ContractBlockInit` and `BlocksMountHandle` here.
export * from './foliwake.js';
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
  MountHandle as BlocksMountHandle,
  MountReport,
  MountStatus,
} from '@foliwake/blocks-contract';
export type * from '@foliwake/blocks-contract/assessment';
