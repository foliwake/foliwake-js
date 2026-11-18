// Names for the core types the commands and their renderers use, over @foliwake/core-contract: each is a
// procedure's input or output, or a long operation's stored result (lib/result-types.ts).
import type { CoreOutput } from '@foliwake/core-contract';

export type { CoreCaller } from '@foliwake/core-contract';
export type {
  BranchResultCore,
  OperationResult,
  ResetStorageResult,
  SiteCreateResult,
  SyncResultCore,
} from './lib/result-types.js';

export type Grant = CoreOutput<'whoami'>;
export type Operation = CoreOutput<'operations.get'>;
export type Recovery = CoreOutput<'operations.recover'>;
export type SiteStatus = CoreOutput<'sites.status'>;
export type SiteList = CoreOutput<'sites.list'>;
export type ResetStoragePlan = CoreOutput<'sites.resetStoragePlan'>;
export type SourceList = CoreOutput<'sources.list'>;
export type PluginList = CoreOutput<'sources.plugins'>;
export type PendingAnswer = CoreOutput<'sources.pending'>;
export type ProbeAnswer = CoreOutput<'sources.probe'>;
export type AddAnswer = CoreOutput<'sources.add'>;
export type BranchList = CoreOutput<'branches.list'>;
export type BranchHistory = CoreOutput<'branches.history'>;
export type Changes = CoreOutput<'content.changes'>;
export type Validation = CoreOutput<'content.validate'>;
export type CredentialList = CoreOutput<'credentials.list'>;
export type CredentialSetResult = CoreOutput<'credentials.set'>;
export type CredentialRemoveResult = CoreOutput<'credentials.remove'>;
