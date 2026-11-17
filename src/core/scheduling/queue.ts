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
 *
 * Mixing (which cards are due is unchanged by it):
 * - New cards are picked round-robin across groups (lectures/documents), so
 *   the daily limit is shared instead of being used up by the first course.
 * - The queue (after time-critical learning cards) is spread evenly across
 *   groups, keeping each group's own order (exam and most-at-risk first).
 * - Siblings (cards of the same Rem, e.g. the clozes of one sentence) are
 *   "buried" like in Anki: at most one per day, so one card never reveals
 *   the answer to the next. The others stay due and come on another day.
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
  /**
   * Group used to mix the queue (the lecture/document the card belongs to).
   * Cards without a group form one group.
   */
  groupId?: string;
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
  /** Learning cards due within this many minutes are shown already (RemNote default 15). */
  learnAheadMinutes?: number;
  shuffle?: boolean;
  rng?: Rng;
}

/** True when a (re)learning card is due within the learn-ahead window. */
export function isLearningDue(state: CardState, now: Timestamp, learnAheadMinutes = 15): boolean {
  return (
    (state.phase === 'learning' || state.phase === 'relearning') &&
    state.due <= now + learnAheadMinutes * MINUTE
  );
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

/** Deterministic 32-bit hash of a string (FNV-1a), for stable daily mixing. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Spreads items evenly across their groups, keeping the order inside each
 * group: item `i` of a group with `n` items is placed at relative position
 * `(i + offset) / n`, so a group with half the items fills every second slot.
 *
 * @param items Items in their preferred order.
 * @param groupOf Group of an item.
 * @param seed Varies the interleaving (e.g. the study day) deterministically.
 */
export function spreadByGroup<T>(
  items: readonly T[],
  groupOf: (item: T) => string,
  seed = '',
): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const g = groupOf(item);
    const list = groups.get(g);
    if (list) list.push(item);
    else groups.set(g, [item]);
  }
  if (groups.size <= 1) return [...items];
  const keyed: { item: T; key: number; tie: number }[] = [];
  for (const [g, list] of groups) {
    const h = hash(`${seed}:${g}`);
    const offset = (h % 1000) / 1000;
    list.forEach((item, i) => keyed.push({ item, key: (i + offset) / list.length, tie: h }));
  }
  return keyed.sort((a, b) => a.key - b.key || a.tie - b.tie).map((k) => k.item);
}

/**
 * Reorders items so that items with the same key are at least `gap` places
 * apart where possible. Greedy: takes the earliest allowed item, unless the
 * most frequent key must be placed now to still fit with the required gaps.
 */
export function separateSiblings<T>(items: readonly T[], keyOf: (item: T) => string, gap = 5): T[] {
  const rest = [...items];
  const count = new Map<string, number>();
  for (const item of items) count.set(keyOf(item), (count.get(keyOf(item)) ?? 0) + 1);
  const out: T[] = [];
  while (rest.length > 0) {
    const recent = new Set(out.slice(-gap).map(keyOf));
    let pick = rest.findIndex((item) => !recent.has(keyOf(item)));
    if (pick >= 0) {
      // c copies of a key need (c - 1) * (gap + 1) + 1 places.
      let urgent: string | null = null;
      for (const [k, c] of count)
        if (c > 1 && !recent.has(k) && rest.length - 1 < (c - 1) * (gap + 1) + 1) urgent = k;
      if (urgent !== null) pick = rest.findIndex((item) => keyOf(item) === urgent);
    }
    const [item] = rest.splice(pick < 0 ? 0 : pick, 1);
    count.set(keyOf(item!), count.get(keyOf(item!))! - 1);
    out.push(item!);
  }
  return out;
}

/**
 * Builds today's global queue.
 *
 * @param entries All enabled cards with their resolved priority.
 * @param opts Limits, quotas and ordering options.
 */
export function buildGlobalQueue(
  entries: readonly QueueEntry[],
  opts: GlobalQueueOptions,
): QueuedCard[] {
  const { now, dayStartHour } = opts;
  const learnAhead = opts.learnAheadMinutes ?? 15;
  const byRisk = (a: QueueEntry, b: QueueEntry): number =>
    opts.retrievability(a) - opts.retrievability(b) || a.state.due - b.state.due;
  const byDoc = (a: QueueEntry, b: QueueEntry): number => a.docOrder - b.docOrder;
  const groupOf = (e: QueueEntry): string => e.groupId ?? '';
  const dayStart = startOfStudyDay(now, dayStartHour);
  const out: (QueuedCard & { entry: QueueEntry })[] = [];
  const taken = new Set<CardId>();
  /** Rems with a card in the queue or practised today (their siblings are buried). */
  const remsToday = new Set<RemId>();
  const buried = (e: QueueEntry): boolean => remsToday.has(e.remId);
  const push = (e: QueueEntry, bucket: QueueBucket, examId?: string): void => {
    if (taken.has(e.cardId)) return;
    // Learning cards are time critical and never buried.
    if (bucket !== 'learning' && buried(e)) return;
    taken.add(e.cardId);
    remsToday.add(e.remId);
    out.push(
      examId
        ? { cardId: e.cardId, bucket, examId, entry: e }
        : { cardId: e.cardId, bucket, entry: e },
    );
  };
  /** The first `n` new cards, taken round-robin across groups in document order. */
  const pickNew = (list: QueueEntry[], n: number): QueueEntry[] => {
    const picked: QueueEntry[] = [];
    const seen = new Set<RemId>();
    for (const e of spreadByGroup([...list].sort(byDoc), groupOf, String(dayStart))) {
      if (picked.length >= n) break;
      if (buried(e) || seen.has(e.remId)) continue;
      seen.add(e.remId);
      picked.push(e);
    }
    return picked;
  };

  const live = entries.filter((e) => e.priority !== 'paused' && !e.state.disabled);
  for (const e of live)
    if (e.state.phase !== 'new' && (e.state.lastReview ?? 0) >= dayStart) remsToday.add(e.remId);

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
    pickNew(
      inExam.filter((e) => e.state.phase === 'new'),
      q.newQuota,
    ).forEach((e) => push(e, 'exam-new', examId));
    inExam
      .filter(
        (e) =>
          e.state.phase === 'review' &&
          (e.state.lastReview ?? 0) < q.finalReviewStart &&
          !taken.has(e.cardId),
      )
      .sort(byRisk)
      .slice(0, q.finalReviewQuota)
      .forEach((e) => push(e, 'exam-final', examId));
  }

  // 3.-5. Regular priorities.
  let newLeft = Math.max(0, opts.newCardsPerDay - opts.newIntroducedToday);
  const regular = (
    priority: EffectivePriority,
    reviewBucket: QueueBucket,
    newBucket: QueueBucket | null,
  ): void => {
    const group = live.filter((e) => e.priority === priority);
    group
      .filter((e) => isReviewDue(e.state, now, dayStartHour))
      .sort(byRisk)
      .forEach((e) => push(e, reviewBucket));
    if (newBucket && newLeft > 0) {
      const fresh = pickNew(
        group.filter((e) => e.state.phase === 'new'),
        newLeft,
      );
      fresh.forEach((e) => push(e, newBucket));
      newLeft -= fresh.length;
    }
  };
  regular('active', 'active-review', 'active-new');
  regular('maintaining', 'maintaining', null);
  regular('none', 'none-review', 'none-new');

  // Learning cards stay first; the rest is mixed across lectures/documents.
  const learning = out.filter((q) => q.bucket === 'learning');
  const others = out.filter((q) => q.bucket !== 'learning');
  const rest = opts.shuffle
    ? shuffle(others, opts.rng)
    : spreadByGroup(others, (q) => groupOf(q.entry), String(dayStart));
  return [...learning, ...rest].map(({ entry: _entry, ...q }) => q);
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
  opts: {
    now: Timestamp;
    dayStartHour: number;
    retrievability: (e: QueueEntry) => number;
    rng?: Rng;
  },
): QueuedCard[] {
  const live = entries.filter((e) => !e.state.disabled);
  const toQueued = (e: QueueEntry, bucket: QueueBucket): QueuedCard => ({
    cardId: e.cardId,
    bucket,
  });
  // Siblings (cards of one Rem) are kept apart, so one card does not show the
  // answer of the next. Everything is still practised (the document was chosen).
  const apart = (list: QueueEntry[]): QueueEntry[] => separateSiblings(list, (e) => e.remId);
  if (mode === 'all-in-order')
    return apart([...live].sort((a, b) => a.docOrder - b.docOrder)).map((e) =>
      toQueued(e, 'active-review'),
    );
  if (mode === 'all' || mode === 'cram')
    return apart(shuffle(live, opts.rng)).map((e) => toQueued(e, 'active-review'));
  const learning = live
    .filter((e) => isLearningDue(e.state, opts.now))
    .sort((a, b) => a.state.due - b.state.due);
  const due = live
    .filter((e) => isReviewDue(e.state, opts.now, opts.dayStartHour))
    .sort((a, b) => opts.retrievability(a) - opts.retrievability(b));
  const fresh = live.filter((e) => e.state.phase === 'new').sort((a, b) => a.docOrder - b.docOrder);
  const ordered = apart([...learning, ...due, ...fresh]);
  const learningIds = new Set(learning.map((e) => e.cardId));
  const dueIds = new Set(due.map((e) => e.cardId));
  const bucketOf = (e: QueueEntry): QueueBucket =>
    learningIds.has(e.cardId) ? 'learning' : dueIds.has(e.cardId) ? 'active-review' : 'active-new';
  return ordered.map((e) => toQueued(e, bucketOf(e)));
}

/**
 * Counts cards due today - the number shown on "N Due" badges. Like RemNote,
 * cards that were never practiced count as due by default.
 */
export function countDue(
  entries: readonly QueueEntry[],
  now: Timestamp,
  dayStartHour: number,
  includeNew = true,
): number {
  let n = 0;
  for (const e of entries) {
    if (e.state.disabled) continue;
    if (
      isReviewDue(e.state, now, dayStartHour) ||
      isLearningDue(e.state, now) ||
      (includeNew && e.state.phase === 'new')
    )
      n++;
  }
  return n;
}

/** Start of the current study day (re-exported for convenience). */
export { startOfStudyDay };
