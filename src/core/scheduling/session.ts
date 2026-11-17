/**
 * A practice session: the mutable, in-memory cursor over a queue.
 *
 * Cards answered with a short delay (learning steps such as "again in 1 min")
 * re-enter the session once due. When nothing else is left, waiting cards are
 * shown early ("learn ahead") so the session can always be finished.
 */
import type { CardId, Timestamp } from '../model/types';
import { HOUR } from '../util/time';

/** A card waiting for its learning step to elapse. */
interface Waiting {
  cardId: CardId;
  due: Timestamp;
}

/** Serializable snapshot used for undo. */
interface Snapshot {
  queue: CardId[];
  waiting: Waiting[];
  done: number;
  answered: CardId[];
  total: number;
  pinned: CardId | undefined;
}

/**
 * Session progress for the UI, counted in cards: a card that comes back for
 * a learning step is still one card, so `total` never grows while practising.
 */
export interface SessionProgress {
  /** Cards finished for this session. */
  done: number;
  /** Cards still to show (in the queue or waiting for a learning step). */
  remaining: number;
  /** Cards in the session (`done + remaining`). */
  total: number;
  /** Answers given (a card answered three times counts three times). */
  answers: number;
}

/** Cursor over the cards of one practice session. */
export class PracticeSession {
  private queue: CardId[];
  private waiting: Waiting[] = [];
  private done = 0;
  private answered: CardId[] = [];
  private readonly history: Snapshot[] = [];
  /** Cards in the session (shrinks only when a card is dropped). */
  private total: number;
  /**
   * The card on screen: it stays the current card until it is answered,
   * skipped or dropped, even if a waiting card becomes due meanwhile (the
   * answer must belong to the question that was shown).
   */
  private pinned: CardId | undefined;

  /**
   * @param cardIds Ordered card ids.
   * @param requeueWindowMs Cards due within this window after answering come
   *   back in the same session (default: 1 hour).
   */
  constructor(
    cardIds: readonly CardId[],
    private readonly requeueWindowMs: number = HOUR,
  ) {
    this.queue = [...new Set(cardIds)];
    this.total = this.queue.length;
  }

  /**
   * The card to show next, or `undefined` when the session is finished.
   *
   * @param now Current time.
   */
  current(now: Timestamp): CardId | undefined {
    if (this.pinned && this.contains(this.pinned)) return this.pinned;
    this.pinned = this.next(now);
    return this.pinned;
  }

  /** The card that should come next. */
  private next(now: Timestamp): CardId | undefined {
    const ready = this.waiting.filter((w) => w.due <= now).sort((a, b) => a.due - b.due)[0];
    if (ready) return ready.cardId;
    if (this.queue.length > 0) return this.queue[0];
    // Learn ahead: show the earliest waiting card.
    return [...this.waiting].sort((a, b) => a.due - b.due)[0]?.cardId;
  }

  /**
   * Records an answer.
   *
   * @param cardId The answered card.
   * @param nextDue When the card is due next (`null` = not again this session).
   * @param now Answer time.
   */
  answer(cardId: CardId, nextDue: Timestamp | null, now: Timestamp): void {
    this.snapshot();
    this.remove(cardId);
    this.done++;
    this.answered.push(cardId);
    if (nextDue !== null && nextDue - now <= this.requeueWindowMs)
      this.waiting.push({ cardId, due: nextDue });
  }

  /** Moves a card to the end of the session without answering it. */
  skip(cardId: CardId): void {
    this.snapshot();
    this.remove(cardId);
    this.queue.push(cardId);
  }

  /** Removes a card completely (e.g. it was deleted or disabled). */
  drop(cardId: CardId): void {
    if (!this.contains(cardId)) return;
    this.snapshot();
    this.remove(cardId);
    this.total--;
  }

  /** Reverts the last answer/skip/drop. Returns false when nothing to undo. */
  undo(): boolean {
    const s = this.history.pop();
    if (!s) return false;
    this.queue = s.queue;
    this.waiting = s.waiting;
    this.done = s.done;
    this.answered = s.answered;
    this.total = s.total;
    this.pinned = s.pinned;
    return true;
  }

  /** Id of the most recently answered card. */
  lastAnswered(): CardId | undefined {
    return this.answered[this.answered.length - 1];
  }

  /** Progress counters. */
  progress(): SessionProgress {
    const remaining = new Set([...this.queue, ...this.waiting.map((w) => w.cardId)]).size;
    return { done: this.total - remaining, remaining, total: this.total, answers: this.done };
  }

  /** True when no card is left. */
  isFinished(): boolean {
    return this.queue.length === 0 && this.waiting.length === 0;
  }

  /** True while a card is still part of the session. */
  private contains(cardId: CardId): boolean {
    return this.queue.includes(cardId) || this.waiting.some((w) => w.cardId === cardId);
  }

  private remove(cardId: CardId): void {
    if (this.pinned === cardId) this.pinned = undefined;
    this.queue = this.queue.filter((id) => id !== cardId);
    this.waiting = this.waiting.filter((w) => w.cardId !== cardId);
  }

  private snapshot(): void {
    this.history.push({
      queue: [...this.queue],
      waiting: [...this.waiting],
      done: this.done,
      answered: [...this.answered],
      total: this.total,
      pinned: this.pinned,
    });
    if (this.history.length > 200) this.history.shift();
  }
}
