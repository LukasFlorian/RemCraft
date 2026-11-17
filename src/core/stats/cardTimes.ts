/**
 * Time spent per card, learned from the review history: which cards are
 * hard (slow or often forgotten) and how long a card will likely take.
 */
import type { CardId, ReviewLog } from '../model/types';

/** Answers longer than this are interruptions, not thinking time. */
export const MAX_ANSWER_MS = 5 * 60_000;

/** How many recent answers make up a card's average time. */
const RECENT_ANSWERS = 5;

/** Time statistics of one card. */
export interface CardTime {
  cardId: CardId;
  /** All answers. */
  answers: number;
  /** Answers with a usable duration. */
  timed: number;
  /** Average seconds of the most recent timed answers (`null` without any). */
  avgSeconds: number | null;
  /** Total seconds spent on the card. */
  totalSeconds: number;
  /** Answers rated "Forgot". */
  forgot: number;
  /** Time of the last answer. */
  lastReviewed: number;
}

/** True for a duration that counts as answering time. */
function usable(ms: number): boolean {
  return ms > 0 && ms < MAX_ANSWER_MS;
}

/**
 * Time statistics of every answered card.
 *
 * @param logs Review logs (any order).
 */
export function cardTimes(logs: readonly ReviewLog[]): Map<CardId, CardTime> {
  const byCard = new Map<CardId, ReviewLog[]>();
  for (const l of logs) {
    const list = byCard.get(l.cardId);
    if (list) list.push(l);
    else byCard.set(l.cardId, [l]);
  }
  const out = new Map<CardId, CardTime>();
  for (const [cardId, list] of byCard) {
    list.sort((a, b) => a.reviewedAt - b.reviewedAt);
    const timed = list.filter((l) => usable(l.durationMs));
    const recent = timed.slice(-RECENT_ANSWERS);
    out.set(cardId, {
      cardId,
      answers: list.length,
      timed: timed.length,
      avgSeconds: recent.length
        ? recent.reduce((s, l) => s + l.durationMs, 0) / recent.length / 1000
        : null,
      totalSeconds: timed.reduce((s, l) => s + l.durationMs, 0) / 1000,
      forgot: list.filter((l) => l.rating === 1).length,
      lastReviewed: list[list.length - 1]!.reviewedAt,
    });
  }
  return out;
}

/**
 * The hardest cards: slow to answer and/or often forgotten.
 *
 * The score is the average answer time weighted by the share of "Forgot"
 * answers (a card forgotten every other time counts double).
 *
 * @param times Result of {@link cardTimes}.
 * @param limit Number of cards.
 * @param minAnswers Cards with fewer answers are not judged yet.
 */
export function hardestCards(
  times: ReadonlyMap<CardId, CardTime>,
  limit = 20,
  minAnswers = 2,
): CardTime[] {
  const score = (t: CardTime): number => (t.avgSeconds ?? 0) * (1 + (2 * t.forgot) / t.answers);
  return [...times.values()]
    .filter((t) => t.answers >= minAnswers && t.avgSeconds !== null)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}
