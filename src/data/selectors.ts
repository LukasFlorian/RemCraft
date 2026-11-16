/**
 * Memoised derived data (selectors) over the store.
 *
 * Every selector declares the collection versions it depends on, so derived
 * values such as "all cards with their inherited priority" are computed once
 * per relevant change instead of once per render.
 */
import { buildCardView } from '@core/cards/content';
import type { CardView } from '@core/cards/content';
import type { CardSpec } from '@core/cards/generate';
import { generateCards } from '@core/cards/generate';
import { createCardState, createDefaultScheduler, createDefaultSettings, DEFAULT_SCHEDULER_ID } from '@core/model/factories';
import type { CardId, CardState, Exam, RemId, ReviewLog, SchedulerConfig, Settings, Timestamp } from '@core/model/types';
import type { ExamActivity, ExamPlan } from '@core/scheduling/exam';
import { planExam } from '@core/scheduling/exam';
import type { InheritedInfo } from '@core/scheduling/inheritance';
import { isExamActive, resolveInheritance } from '@core/scheduling/inheritance';
import type { ExamQuota, QueuedCard, QueueEntry } from '@core/scheduling/queue';
import { buildGlobalQueue, countDue, isLearningDue, isReviewDue } from '@core/scheduling/queue';
import type { Scheduler } from '@core/scheduling/scheduler';
import { createScheduler } from '@core/scheduling/scheduler';
import { addStudyDays, MINUTE, startOfStudyDay } from '@core/util/time';
import type { Store } from './store/store';

/** Coarse time bucket so time-dependent selectors recompute at most once per minute. */
const minuteOf = (now: Timestamp): number => Math.floor(now / MINUTE);

// ---------------------------------------------------------------------------
// Settings & schedulers
// ---------------------------------------------------------------------------

/** The user's settings (defaults when none are stored yet). */
export function selectSettings(store: Store): Settings {
  return store.memo('settings', [store.collectionVersion('settings')], () => ({
    ...createDefaultSettings(0),
    ...store.getRecord('settings', 'settings'),
  }));
}

/** All scheduler configurations, the default one first. */
export function selectSchedulers(store: Store): SchedulerConfig[] {
  return store.memo('schedulers', [store.collectionVersion('schedulers')], () => {
    const list = [...store.all('schedulers')];
    if (!list.some((s) => s.id === DEFAULT_SCHEDULER_ID)) list.unshift(createDefaultScheduler(0));
    return list.sort((a, b) => (a.id === DEFAULT_SCHEDULER_ID ? -1 : b.id === DEFAULT_SCHEDULER_ID ? 1 : a.name.localeCompare(b.name)));
  });
}

/** Scheduler instances by configuration id. */
function selectSchedulerInstances(store: Store): Map<string, Scheduler> {
  return store.memo('schedulerInstances', [store.collectionVersion('schedulers')], () => new Map(selectSchedulers(store).map((c) => [c.id, createScheduler(c)])));
}

/** Resolves a scheduler id (falling back to the global default). */
export function schedulerById(store: Store, id: string | undefined): Scheduler {
  const instances = selectSchedulerInstances(store);
  const settings = selectSettings(store);
  return instances.get(id ?? '') ?? instances.get(settings.defaultSchedulerId) ?? instances.get(DEFAULT_SCHEDULER_ID)!;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** All derived cards plus document order. */
export interface CardIndex {
  specs: CardSpec[];
  byId: Map<CardId, CardSpec>;
  byRem: Map<RemId, CardSpec[]>;
  /** Pre-order position of every Rem (document order). */
  docOrder: Map<RemId, number>;
}

/** Derives every card of the knowledge base (recomputed when Rems change). */
export function selectCardIndex(store: Store): CardIndex {
  return store.memo('cardIndex', [store.collectionVersion('rems')], () => {
    const specs: CardSpec[] = [];
    const byId = new Map<CardId, CardSpec>();
    const byRem = new Map<RemId, CardSpec[]>();
    const docOrder = new Map<RemId, number>();
    let position = 0;
    // Iterative pre-order traversal from the top level.
    const stack = [...store.children(null)].reverse();
    while (stack.length > 0) {
      const rem = stack.pop()!;
      if (docOrder.has(rem.id)) continue;
      docOrder.set(rem.id, position++);
      const children = store.children(rem.id);
      const cards = generateCards(rem, children);
      if (cards.length > 0) {
        byRem.set(rem.id, cards);
        for (const c of cards) {
          specs.push(c);
          byId.set(c.id, c);
        }
      }
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
    }
    return { specs, byId, byRem, docOrder };
  });
}

/** Persisted state of a card or a fresh "new" state. */
export function cardStateOf(store: Store, spec: CardSpec): CardState {
  return store.getRecord('cards', spec.id) ?? createCardState(spec.id, spec.remId, store.get(spec.remId)?.createdAt ?? 0);
}

/** Inherited settings of all Rems. */
export function selectInheritance(store: Store, now: Timestamp): Map<RemId, InheritedInfo> {
  // Exams activate/deactivate with time; recompute at most once a minute.
  return store.memo('inheritance', [store.collectionVersion('rems'), store.collectionVersion('exams'), minuteOf(now)], () =>
    resolveInheritance(store, store.all('exams'), now),
  );
}

/** Queue entries of all cards (priority, state, document order). */
export function selectQueueEntries(store: Store, now: Timestamp): QueueEntry[] {
  return store.memo(
    'queueEntries',
    [store.collectionVersion('rems'), store.collectionVersion('cards'), store.collectionVersion('exams'), minuteOf(now)],
    () => {
      const index = selectCardIndex(store);
      const inherited = selectInheritance(store, now);
      return index.specs.map((spec) => {
        const info = inherited.get(spec.remId);
        return {
          cardId: spec.id,
          remId: spec.remId,
          state: cardStateOf(store, spec),
          priority: info?.priority ?? 'none',
          examIds: info?.examIds ?? [],
          docOrder: index.docOrder.get(spec.remId) ?? 0,
        };
      });
    },
  );
}

/** Scheduler responsible for a Rem's cards. */
export function schedulerForRem(store: Store, remId: RemId, now: Timestamp): Scheduler {
  return schedulerById(store, selectInheritance(store, now).get(remId)?.schedulerId);
}

/** The view model of a card (for the practice screen). */
export function selectCardView(store: Store, cardId: CardId): CardView | undefined {
  return buildCardView(cardId, store);
}

/**
 * Due counts per subtree (Rem id -> number of due + new cards in the
 * subtree), computed bottom-up in one pass.
 */
export function selectDueCounts(store: Store, now: Timestamp): Map<RemId, number> {
  return store.memo('dueCounts', [store.collectionVersion('rems'), store.collectionVersion('cards'), minuteOf(now)], () => {
    const settings = selectSettings(store);
    const counts = new Map<RemId, number>();
    const own = new Map<RemId, number>();
    for (const e of selectQueueEntries(store, now)) {
      if (countDue([e], now, settings.dayStartHour) > 0) own.set(e.remId, (own.get(e.remId) ?? 0) + 1);
    }
    // Add every Rem's own count to itself and all its ancestors.
    for (const [remId, n] of own) {
      let cur: RemId | null = remId;
      const seen = new Set<RemId>();
      while (cur !== null && !seen.has(cur)) {
        seen.add(cur);
        counts.set(cur, (counts.get(cur) ?? 0) + n);
        cur = store.get(cur)?.parentId ?? null;
      }
    }
    return counts;
  });
}

// ---------------------------------------------------------------------------
// Logs, exams and the global queue
// ---------------------------------------------------------------------------

/** Review logs sorted by time. */
export function selectLogs(store: Store): ReviewLog[] {
  return store.memo('logs', [store.collectionVersion('logs')], () => [...store.all('logs')].sort((a, b) => a.reviewedAt - b.reviewedAt));
}

/** Logs of the current study day. */
export function selectTodayLogs(store: Store, now: Timestamp): ReviewLog[] {
  const settings = selectSettings(store);
  const start = startOfStudyDay(now, settings.dayStartHour);
  return store.memo('todayLogs', [store.collectionVersion('logs'), start], () => selectLogs(store).filter((l) => l.reviewedAt >= start));
}

/** Exams sorted by date (upcoming first). */
export function selectExams(store: Store): Exam[] {
  return store.memo('exams', [store.collectionVersion('exams')], () => [...store.all('exams')].sort((a, b) => a.date - b.date));
}

/** Study plans of all exams. */
export function selectExamPlans(store: Store, now: Timestamp): ExamPlan[] {
  return store.memo(
    'examPlans',
    [store.collectionVersion('rems'), store.collectionVersion('cards'), store.collectionVersion('exams'), store.collectionVersion('logs'), minuteOf(now)],
    () => {
      const settings = selectSettings(store);
      const entries = selectQueueEntries(store, now);
      const todayLogs = selectTodayLogs(store, now);
      return selectExams(store).map((exam) => {
        const inExam = entries.filter((e) => e.examIds.includes(exam.id) && !e.state.disabled);
        const ids = new Set(inExam.map((e) => e.cardId));
        const examLogs = todayLogs.filter((l) => ids.has(l.cardId));
        const activity: ExamActivity = {
          introducedToday: new Set(examLogs.filter((l) => l.before.phase === 'new').map((l) => l.cardId)).size,
          correctToday: examLogs.filter((l) => l.rating > 1).length,
        };
        const scheduler = schedulerById(store, undefined);
        return planExam(exam, inExam.map((e) => e.state), activity, now, settings.dayStartHour, scheduler);
      });
    },
  );
}

/** Today's global queue. */
export function selectGlobalQueue(store: Store, now: Timestamp): QueuedCard[] {
  return store.memo(
    'globalQueue',
    [store.collectionVersion('rems'), store.collectionVersion('cards'), store.collectionVersion('exams'), store.collectionVersion('logs'), store.collectionVersion('settings'), minuteOf(now)],
    () => {
      const settings = selectSettings(store);
      const entries = selectQueueEntries(store, now);
      const todayLogs = selectTodayLogs(store, now);
      const examCardIds = new Set(entries.filter((e) => e.priority === 'exam').map((e) => e.cardId));
      const newIntroducedToday = new Set(todayLogs.filter((l) => l.before.phase === 'new' && !examCardIds.has(l.cardId)).map((l) => l.cardId)).size;
      const examQuotas = new Map<string, ExamQuota>();
      for (const plan of selectExamPlans(store, now)) {
        if (!isExamActive(plan.exam, now)) continue;
        examQuotas.set(plan.exam.id, { newQuota: plan.todayNewQuota, finalReviewQuota: plan.todayFinalReviewQuota, finalReviewStart: plan.finalReviewStart });
      }
      const inherited = selectInheritance(store, now);
      return buildGlobalQueue(entries, {
        now,
        dayStartHour: settings.dayStartHour,
        newCardsPerDay: settings.newCardsPerDay,
        newIntroducedToday,
        examQuotas,
        retrievability: (e) => schedulerById(store, inherited.get(e.remId)?.schedulerId).retrievability(e.state, now),
        shuffle: settings.shuffleQueue,
      });
    },
  );
}

/** Buckets that count towards the daily goal in a given goal mode. */
export function countsTowardsGoal(bucket: QueuedCard['bucket'], mode: Settings['dailyGoalMode']): boolean {
  if (mode === 'all-due' || mode === 'custom-number') return true;
  return bucket !== 'maintaining' && bucket !== 'none-review' && bucket !== 'none-new';
}

/** Cards that are due today in a set of entries (helper for UI badges). */
export function dueToday(entries: readonly QueueEntry[], now: Timestamp, dayStartHour: number): QueueEntry[] {
  return entries.filter((e) => !e.state.disabled && (isReviewDue(e.state, now, dayStartHour) || isLearningDue(e.state, now)));
}

/** Start of tomorrow's study day. */
export function tomorrowStart(store: Store, now: Timestamp): Timestamp {
  return addStudyDays(now, 1, selectSettings(store).dayStartHour);
}
