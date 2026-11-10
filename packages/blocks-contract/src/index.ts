// The block ↔ app contract `foliwake-blocks/1` (docs/contracts/blocks-contract.md), generalised from
// gaiare-lessons-site's `gaiare-blocks/1` (#14 §1, #15 `scripts/blocks-types.d.ts`). Types only: a code
// release implements `BlocksModule`; an app builds a `BlockHost` (or lets @foliwake/client build it).
// Minor versions only add; a major version changes anything else.

export type ChannelName = 'live' | 'preview';
export type BlockMode = 'practice' | 'exam' | 'review';

/** The version a code release or a host speaks. */
export interface ContractVersion {
  major: 1;
  minor: number;
}

/** What `<code release>/<blocks.entry>` exports. */
export interface BlocksModule {
  /** `eventPrefix` (foliwake-blocks/1.1): the prefix its blocks emit events with; absent → the app's configured one. */
  BLOCKS_CONTRACT: ContractVersion & { eventPrefix?: string };
  /** Mounts every `[data-component]` root inside `container`; `host` optional (the module's browser host when omitted). */
  mountBlocks(container: Element, host?: BlockHost): MountHandle;
}

export interface MountHandle {
  /** One report per root once every root settled. */
  ready: Promise<BlockReport[]>;
  /** Idempotent. Leaves the DOM as it is (the app restores the body before a second mount). */
  dispose(): void;
}

/** A root's outcome (Gaiare's `MountReport`). */
export interface BlockReport {
  root?: Element;
  /** The `data-component` name. */
  name: string;
  key: string | null;
  status: 'ready' | 'error' | 'disposed';
  /** A failure code (`LOADER_JS_FAILED`, …) when status is 'error'. */
  code?: string;
}

export type Answer = { selected: string[]; refused?: string[] };
/** `reveal`: sanitised HTML of fields stripped in exam mode, by field name. */
export type Verdict = { correct: boolean; correctIds?: string[]; reveal?: Record<string, string> };
/** `pending`: an answer the app has not confirmed yet (an offline outbox). */
export type SavedAnswer = Answer & { correct: boolean | null; verdict?: Verdict; pending?: boolean };

/** The object an app gives every block. Optional members are announced by `has(name)`. */
export interface BlockHost {
  contract: ContractVersion;
  /** Which app mounts ('next', 'react', 'foliwake', 'webview', …). */
  shell: string;
  /** HTML contract of the body being mounted (`X-Html-Contract`). */
  htmlContract: string;
  channel: ChannelName;
  /** 'local' | 'preview' show loader notices before failed roots; anything else: console only. */
  env?: string;
  mode: BlockMode;
  /** Content language (BCP 47). */
  lang: string;
  /** The app's UI language for block chrome. */
  uiLang: string;
  /** Translated block chrome ('check' → 'Проверить'), from the app's i18n. */
  labels?: Record<string, string>;
  theme: 'light' | 'dark';
  reducedMotion: boolean;
  /** Aborted on dispose; a block treats it as dispose. */
  signal: AbortSignal;
  /** `retry` undefined: the block's own default. */
  policy: { retry?: boolean };
  keyOf(root: Element): string;
  saved?(key: string): SavedAnswer | null;
  /** Server-side grading (block exams; later). */
  check?(key: string, answer: Answer, opts: { signal: AbortSignal }): Promise<Verdict>;
  media?(url: string, hint?: { width?: number }): string;
  track?(name: string, data: Record<string, unknown>): void;
  has(feature: string): boolean;
}

export type BlockEventType = 'ready' | 'select' | 'check' | 'answer' | 'reset' | 'complete' | 'error';

export interface BlockEventDetails {
  ready: { contract: number; required: boolean; restored: boolean };
  select: { selected: string[] };
  check: Answer;
  answer: Answer & { correct: boolean | null; graded: 'local' | 'host' };
  reset: { reason: 'retry' | 'host' };
  complete: Record<string, never>;
  error: { code: string; message: string; recoverable: boolean };
}

/** Every event carries the block's key and name besides its own fields. */
export type BlockEventDetail<T extends BlockEventType> = BlockEventDetails[T] & { key: string; block: string };

/** A block event as an app receives it (`<prefix>:<type>` CustomEvent, bubbling from the block root). */
export interface FoliwakeEvent<T extends BlockEventType = BlockEventType> {
  type: T;
  detail: BlockEventDetail<T>;
  target: Element;
  native: CustomEvent;
}

/** Every event type, in a fixed order. */
export type BlockEventTypes = readonly BlockEventType[];

/** The contract name an app config names (`app.blocks.contract`). */
export type BlocksContractName = `foliwake-blocks/${number}`;
