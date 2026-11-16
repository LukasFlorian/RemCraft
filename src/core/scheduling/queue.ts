/**
 * Queue construction: which cards to practice, in which order.
 *
 * Global queue (RemNote semantics):
 * 1. (Re)learning cards that are due now - they are time critical.
 * 2. Exam cards: due reviews, the day's new-card quota, final reviews.
 * 3. "Currently studying" (active) cards: due reviews, then new cards up to
 *    the daily new-card limit.
 * 4. Maintaining cards (due reviews only).
 * 5. Cards without priority: due reviews, then new cards (shared limit).
 * Paused cards never appear in the global queue.
 *
 * Within a bucket, reviews are ordered by retrievability (most at risk
 * first); new cards keep document order.
 */
import type { CardId, CardState, EffectivePriority, RemId, Timestamp } from '../model/types';
import { addStudyDays, MINUTE, startOfStudyDay } from '../util/time';
import type { Rng } from './common';

/** A card together with everything needed to queue it. */
export interface QueueEntry {
  cardId: CardId;
  remId: RemId;
  state: CardState;
  priority: EffectivePriority;
  examIds: readonly string[];
  /** Position in document order (smaller = earlier). */
  docOrder: number;
}

/** Bucket a queued card was taken from (used for UI counters and goals). */
export type QueueBucket =
  | 'learning'
  | 'exam-review'
  | 'exam-new'
  | 'exam-final'
  | 'active-review'
  | 'active-new'
  | 'maintaining'
  | 'none-review'
  | 'none-new';

/** A queued card. */
export interface QueuedCard {
  cardId: CardId;
  bucket: QueueBucket;
  examId?: string;
}

/** Per-exam quotas for today. */
export interface ExamQuota {
  newQuota: number;
  finalReviewQuota: number;
  finalReviewStart: Timestamp;
}

/** Options for {@link buildGlobalQueue}. */
export interface GlobalQueueOptions {
  now: Timestamp;
  dayStartHour: number;
  /** Maximum new cards per day outside exams. */
  newCardsPerDay: number;
  /** New (non-exam) cards already introduced today. */
  newIntroducedToday: number;
  examQuotas: ReadonlyMap<string, ExamQuota>;
  /** Recall probability of a card (for ordering). */
  retrievability: (entry: QueueEntry) => number;
  /** Learning cards due within this many minutes are shown already. */
  learnAheadMinutes?: number;
  shuffle?: boolean;
  rng?: Rng;
}

/** True when a (re)learning card is due within the learn-ahead window. */
export function isLearningDue(state: CardState, now: Timestamp, learnAheadMinutes = 20): boolean {
  return (state.phase === 'learning' || state.phase === 'relearning') && state.due <= now + learnAheadMinutes * MINUTE;
}

/** True when a review-phase card is due by the end of the study day. */
export function isReviewDue(state: CardState, now: Timestamp, dayStartHour: number): boolean {
  return state.phase === 'review' && state.due < addStudyDays(now, 1, dayStartHour);
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Builds today's global queue.
 *
 * @param entries All enabled cards with their resolved priority.
 * @param opts Limits, quotas and ordering options.
 */
export function buildGlobalQueue(entries: readonly QueueEntry[], opts: GlobalQueueOptions): QueuedCard[] {
  const { now, dayStartHour } = opts;
  const learnAhead = opts.learnAheadMinutes ?? 20;
  const byRisk = (a: QueueEntry, b: QueueEntry): number =>
    opts.retrievability(a) - opts.retrievability(b) || a.state.due - b.state.due;
  const byDoc = (a: QueueEntry, b: QueueEntry): number => a.docOrder - b.docOrder;
  const out: QueuedCard[] = [];
  const taken = new Set<CardId>();
  const push = (e: QueueEntry, bucket: QueueBucket, examId?: string): void => {
    if (taken.has(e.cardId)) return;
    taken.add(e.cardId);
    out.push(examId ? { cardId: e.cardId, bucket, examId } : { cardId: e.cardId, bucket });
  };

  const live = entries.filter((e) => e.priority !== 'paused' && !e.state.disabled);

  // 1. Learning cards (any priority).
  live
    .filter((e) => isLearningDue(e.state, now, learnAhead))
    .sort((a, b) => a.state.due - b.state.due)
    .forEach((e) => push(e, 'learning', e.examIds[0]));

  // 2. Exams.
  const examEntries = live.filter((e) => e.priority === 'exam');
  examEntries
    .filter((e) => isReviewDue(e.state, now, dayStartHour))
    .sort(byRisk)
    .forEach((e) => push(e, 'exam-review', e.examIds[0]));
  for (const [examId, q] of opts.examQuotas) {
    const inExam = examEntries.filter((e) => e.examIds.includes(examId));
    inExam
      .filter((e) => e.state.phase === 'new')
      .sort(byDoc)
      .slice(0, q.newQuota)
      .forEach((e) => push(e, 'exam-new', examId));
    inExam
      .filter((e) => e.state.phase === 'review' && (e.state.lastReview ?? 0) < q.finalReviewStart && !taken.has(e.cardId))
      .sort(byRisk)
      .slice(0, q.finalReviewQuota)
      .forEach((e) => push(e, 'exam-final', examId));
  }

  // 3.-5. Regular priorities.
  let newLeft = Math.max(0, opts.newCardsPerDay - opts.newIntroducedToday);
  const regular = (priority: EffectivePriority, reviewBucket: QueueBucket, newBucket: QueueBucket | null): void => {
    const group = live.filter((e) => e.priority === priority);
    group
      .filter((e) => isReviewDue(e.state, now, dayStartHour))
      .sort(byRisk)
      .forEach((e) => push(e, reviewBucket));
    if (newBucket && newLeft > 0) {
      const fresh = group.filter((e) => e.state.phase === 'new').sort(byDoc).slice(0, newLeft);
      fresh.forEach((e) => push(e, newBucket));
      newLeft -= fresh.length;
    }
  };
  regular('active', 'active-review', 'active-new');
  regular('maintaining', 'maintaining', null);
  regular('none', 'none-review', 'none-new');

  if (opts.shuffle) {
    // Keep learning cards first; shuffle the rest.
    const learning = out.filter((q) => q.bucket === 'learning');
    const rest = shuffle(out.filter((q) => q.bucket !== 'learning'), opts.rng);
    return [...learning, ...rest];
  }
  return out;
}

/** Practice modes for a specific document or folder. */
export type DocumentPracticeMode = 'srs' | 'all' | 'all-in-order' | 'cram';

/**
 * Builds the queue for practicing a document/folder subtree.
 *
 * - `srs`: due cards first, then all new cards (paused cards included - the
 *   user explicitly chose this document).
 * - `all` / `cram`: every card in random order.
 * - `all-in-order`: every card in document order.
 */
export function buildDocumentQueue(
  entries: readonly QueueEntry[],
  mode: DocumentPracticeMode,
  opts: { now: Timestamp; dayStartHour: number; retrievability: (e: QueueEntry) => number; rng?: Rng },
): QueuedCard[] {
  const live = entries.filter((e) => !e.state.disabled);
  const toQueued = (e: QueueEntry, bucket: QueueBucket): QueuedCard => ({ cardId: e.cardId, bucket });
  if (mode === 'all-in-order') return [...live].sort((a, b) => a.docOrder - b.docOrder).map((e) => toQueued(e, 'active-review'));
  if (mode === 'all' || mode === 'cram') return shuffle(live, opts.rng).map((e) => toQueued(e, 'active-review'));
  const learning = live.filter((e) => isLearningDue(e.state, opts.now)).sort((a, b) => a.state.due - b.state.due);
  const due = live
    .filter((e) => isReviewDue(e.state, opts.now, opts.dayStartHour))
    .sort((a, b) => opts.retrievability(a) - opts.retrievability(b));
  const fresh = live.filter((e) => e.state.phase === 'new').sort((a, b) => a.docOrder - b.docOrder);
  return [
    ...learning.map((e) => toQueued(e, 'learning')),
    ...due.map((e) => toQueued(e, 'active-review')),
    ...fresh.map((e) => toQueued(e, 'active-new')),
  ];
}

/**
 * Counts cards due today - the number shown on "N Due" badges. Like RemNote,
 * cards that were never practiced count as due by default.
 */
export function countDue(entries: readonly QueueEntry[], now: Timestamp, dayStartHour: number, includeNew = true): number {
  let n = 0;
  for (const e of entries) {
    if (e.state.disabled) continue;
    if (isReviewDue(e.state, now, dayStartHour) || isLearningDue(e.state, now) || (includeNew && e.state.phase === 'new')) n++;
  }
  return n;
}

/** Start of the current study day (re-exported for convenience). */
export { startOfStudyDay };
