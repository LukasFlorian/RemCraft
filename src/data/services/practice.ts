/**
 * Application service for practicing flashcards: building queues, recording
 * answers (with exam rules), undo, previews and card management.
 */
import { createCardState } from '@core/model/factories';
import { isInSubtree } from '@core/model/graph';
import type {
  CardId,
  CardState,
  PracticeMode,
  Rating,
  RemId,
  ReviewLog,
  Timestamp,
} from '@core/model/types';
import { applyExamPolicy } from '@core/scheduling/exam';
import type { DocumentPracticeMode, QueuedCard } from '@core/scheduling/queue';
import { buildDocumentQueue } from '@core/scheduling/queue';
import { previewRatings } from '@core/scheduling/scheduler';
import { newId } from '@core/util/ids';
import { DAY, HOUR } from '@core/util/time';
import {
  cardStateOf,
  schedulerById,
  selectCardIndex,
  selectGlobalQueue,
  selectInheritance,
  selectQueueEntries,
  selectSettings,
} from '../selectors';
import type { Store } from '../store/store';

/** Where a practice session draws its cards from. */
export type PracticeScope =
  { kind: 'global' } | { kind: 'rem'; remId: RemId; mode: DocumentPracticeMode };

/** Result of answering a card. */
export interface AnswerResult {
  state: CardState;
  log: ReviewLog | null;
}

/** Flashcard practice service. */
export class PracticeService {
  constructor(private readonly store: Store) {}

  /**
   * Builds the queue for a scope.
   *
   * @param scope Global queue or a document/folder subtree.
   * @param now Current time.
   */
  buildQueue(scope: PracticeScope, now: Timestamp): QueuedCard[] {
    if (scope.kind === 'global') return selectGlobalQueue(this.store, now);
    const settings = selectSettings(this.store);
    const inherited = selectInheritance(this.store, now);
    const entries = selectQueueEntries(this.store, now).filter((e) =>
      isInSubtree(this.store, e.remId, scope.remId),
    );
    return buildDocumentQueue(entries, scope.mode, {
      now,
      dayStartHour: settings.dayStartHour,
      retrievability: (e) =>
        schedulerById(this.store, inherited.get(e.remId)?.schedulerId).retrievability(e.state, now),
    });
  }

  /** Current state of a card (fresh "new" state if never practiced). */
  stateOf(cardId: CardId): CardState | undefined {
    const spec = selectCardIndex(this.store).byId.get(cardId);
    if (spec) return cardStateOf(this.store, spec);
    return this.store.getRecord('cards', cardId);
  }

  /**
   * Interval previews for the rating buttons (milliseconds until due).
   */
  previews(cardId: CardId, now: Timestamp): Record<Rating, number> | undefined {
    const state = this.stateOf(cardId);
    if (!state) return undefined;
    const scheduler = schedulerById(
      this.store,
      selectInheritance(this.store, now).get(state.remId)?.schedulerId,
    );
    const next = previewRatings(scheduler, state, now);
    return {
      1: next[1].due - now,
      2: next[2].due - now,
      3: next[3].due - now,
      4: next[4].due - now,
    };
  }

  /**
   * Records an answer.
   *
   * @param cardId Answered card.
   * @param rating Self-assessment.
   * @param opts Time, duration and mode. In `cram` mode nothing is stored.
   */
  answer(
    cardId: CardId,
    rating: Rating,
    opts: { now: Timestamp; durationMs: number; mode: PracticeMode },
  ): AnswerResult | undefined {
    const before = this.stateOf(cardId);
    if (!before) return undefined;
    const { now } = opts;
    const info = selectInheritance(this.store, now).get(before.remId);
    const scheduler = schedulerById(this.store, info?.schedulerId);
    let next = scheduler.review(before, rating, now);
    const examId = info?.examIds[0];
    const exam = examId ? this.store.getRecord('exams', examId) : undefined;
    if (exam && opts.mode !== 'cram') next = applyExamPolicy(before, next, exam, now);
    if (opts.mode === 'cram') return { state: next, log: null };

    const log: ReviewLog = {
      id: newId(),
      cardId,
      remId: before.remId,
      rating,
      reviewedAt: now,
      durationMs: Math.max(0, Math.round(opts.durationMs)),
      mode: exam ? 'exam' : opts.mode,
      algorithm: scheduler.algorithm,
      before,
      intervalAfter: Math.max(0, (next.due - now) / DAY),
      dueAfter: next.due,
      ...(exam ? { examId: exam.id } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.store.transact(
      (tx) => {
        tx.put('cards', next);
        tx.put('logs', log);
      },
      { undoable: false },
    );
    return { state: next, log };
  }

  /**
   * Reverts an answer: restores the previous state and deletes the log.
   */
  undoAnswer(logId: string): boolean {
    const log = this.store.getRecord('logs', logId);
    if (!log) return false;
    this.store.transact(
      (tx) => {
        if (log.before.phase === 'new' && log.before.reps === 0) tx.delete('cards', log.cardId);
        else tx.put('cards', log.before);
        tx.delete('logs', logId);
      },
      { undoable: false },
    );
    return true;
  }

  /**
   * Skips a card: no rating is recorded; reviewed cards come back in an hour.
   */
  skip(cardId: CardId, now: Timestamp): void {
    const state = this.stateOf(cardId);
    if (!state || state.phase === 'new') return;
    this.store.transact((tx) => void tx.put('cards', { ...state, due: now + HOUR }), {
      undoable: false,
    });
  }

  /** Enables/disables cards. */
  setDisabled(cardIds: readonly CardId[], disabled: boolean): void {
    this.store.transact((tx) => {
      for (const id of cardIds) {
        const state = this.stateOf(id);
        if (state) tx.put('cards', { ...state, disabled: disabled || undefined } as CardState);
      }
    });
  }

  /** Resets cards to "new" (review history is kept). */
  reset(cardIds: readonly CardId[]): void {
    this.store.transact((tx) => {
      for (const id of cardIds) {
        const state = this.stateOf(id);
        if (state)
          tx.put('cards', {
            ...createCardState(id, state.remId, state.createdAt),
            ...(state.disabled ? { disabled: true } : {}),
          });
      }
    });
  }

  /** Reschedules cards to be due at a given time. */
  setDue(cardIds: readonly CardId[], due: Timestamp): void {
    this.store.transact((tx) => {
      for (const id of cardIds) {
        const state = this.stateOf(id);
        if (state && state.phase !== 'new') tx.put('cards', { ...state, due });
      }
    });
  }
}
