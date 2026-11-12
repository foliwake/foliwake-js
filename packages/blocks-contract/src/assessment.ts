// `@foliwake/blocks-contract/assessment`: the vocabulary of exercises (answers, verdicts, saved answers, grading)
// as an extension of the core contract. A site whose blocks ask and grade (a quiz, a lesson) types its host
// `AssessmentHost` and its events `AssessmentEvents`; the engine and the core know nothing of it.
import type { BlockEvents, BlockHost } from './index.js';

/** The modes an assessment runs in: `practice` (answer and see), `exam` (graded by the host), `review` (read back). */
export type AssessmentMode = 'practice' | 'exam' | 'review';

/** A block answer: the `selected` option ids, optionally `refused` ones. */
export type Answer = { selected: string[]; refused?: string[] };
/** `reveal`: sanitised HTML of fields stripped in exam mode, by field name. */
export type Verdict = { correct: boolean; correctIds?: string[]; reveal?: Record<string, string> };
/** `pending`: an answer the app has not confirmed yet (an offline outbox). */
export type SavedAnswer = Answer & { correct: boolean | null; verdict?: Verdict; pending?: boolean };

/** The host members of the extension; each is announced by `has(name)`. */
export interface AssessmentHostMembers {
  mode?: AssessmentMode;
  /** `retry` undefined: the block's own default. */
  policy?: { retry?: boolean };
  saved?(key: string): SavedAnswer | null;
  /** Server-side grading (exams). */
  check?(key: string, answer: Answer, opts: { signal: AbortSignal }): Promise<Verdict>;
}

/** The host of an assessment block. */
export type AssessmentHost = BlockHost<AssessmentHostMembers>;

/** The event details the extension adds (besides `key` and `block`). */
export interface AssessmentEventDetails {
  /** Added to the core `ready`: whether the block needs an answer, and whether a saved one was restored. */
  ready: { required: boolean; restored: boolean };
  select: { selected: string[] };
  check: Answer;
  answer: Answer & { correct: boolean | null; graded: 'local' | 'host' };
  reset: { reason: 'retry' | 'host' };
  complete: Record<string, never>;
}

/** The events of an assessment block: the core's and the extension's. */
export type AssessmentEvents = BlockEvents<AssessmentEventDetails>;
