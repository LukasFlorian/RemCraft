/**
 * Practice sessions that survive leaving the practice screen: looking at a
 * card's slide (or anything else) and coming back continues where you left
 * off instead of starting the queue again. A session is kept until it is
 * finished or the study day changes.
 */
import type { CardId } from '@core/model/types';
import type { PracticeSession } from '@core/scheduling/session';

/** Undoable step of a session: an answer (its log id) or a disabled card. */
export type PracticeStep = { answer: string | null } | { disabled: CardId };

/** Everything a running session needs besides the store. */
export interface CachedSession {
  session: PracticeSession;
  steps: PracticeStep[];
  stats: { answered: number; correct: number; startedAt: number };
  /** Study day the session belongs to (start timestamp). */
  day: number;
}

const sessions = new Map<string, CachedSession>();

/**
 * The running session for a scope, or a new one.
 *
 * @param key Scope and mode of the session (e.g. the URL query).
 * @param day Start of the current study day; older sessions are discarded.
 * @param create Builds a new session.
 */
export function sessionFor(key: string, day: number, create: () => PracticeSession): CachedSession {
  const cached = sessions.get(key);
  if (cached && cached.day === day && !cached.session.isFinished()) return cached;
  const fresh: CachedSession = {
    session: create(),
    steps: [],
    stats: { answered: 0, correct: 0, startedAt: Date.now() },
    day,
  };
  sessions.set(key, fresh);
  return fresh;
}

/** Forgets a session (e.g. when it was finished and closed). */
export function dropSession(key: string): void {
  sessions.delete(key);
}
