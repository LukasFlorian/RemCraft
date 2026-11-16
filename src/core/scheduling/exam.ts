/**
 * Exam scheduler.
 *
 * Works *on top of* the regular algorithm (SM-2 or FSRS), modelled after
 * RemNote's Exam Scheduler V2:
 *
 * - **Learning period** - cards that were never practiced are spread evenly
 *   over the days until the final review starts (or made due immediately,
 *   depending on {@link Exam.newCardMode}). The daily quota is recomputed
 *   every day from what is left, which automatically redistributes missed
 *   work ("catch up").
 * - **Regular reviews** - due cards follow the normal algorithm.
 * - **Extra practice** - a missed card must be recalled successfully twice in
 *   a row before it leaves (re)learning.
 * - **Final review** - during the last `finalReviewDays` before the exam every
 *   card gets one more review, spread evenly across those days.
 *
 * Everything here is pure: plans are recomputed from card states on demand.
 */
import type { CardState, Exam, Timestamp } from '../model/types';
import { addStudyDays, DAY, MINUTE, startOfStudyDay, studyDaysBetween } from '../util/time';
import type { Scheduler } from './common';

/** Planned work for one study day. */
export interface ExamDayPlan {
  /** Start of the study day. */
  day: Timestamp;
  /** New cards to learn. */
  newCards: number;
  /** Regular reviews (projected). */
  reviews: number;
  /** Final-review cards. */
  finalReview: number;
  phase: 'learning' | 'final-review' | 'exam';
}

/** Lifecycle status of an exam. */
export type ExamStatus = 'learning' | 'final-review' | 'exam-day' | 'past' | 'archived';

/** Everything the UI needs to show an exam's study plan. */
export interface ExamPlan {
  exam: Exam;
  status: ExamStatus;
  /** Start of the study day of the exam. */
  examDay: Timestamp;
  /** Start of the first final-review day (= exam day without final review). */
  finalReviewStart: Timestamp;
  /** Whole study days until the exam (0 = today). */
  daysLeft: number;
  totalCards: number;
  /** Cards never practiced. */
  newRemaining: number;
  /** Cards that left the learning phase at least once. */
  learnedCards: number;
  /** Reviews that were already overdue before today. */
  overdueBacklog: number;
  todayNewQuota: number;
  todayDueReviews: number;
  todayFinalReviewQuota: number;
  /** Cards to get right today for this exam. */
  todayTarget: number;
  /** Exam cards answered correctly today. */
  todayDone: number;
  onTrack: boolean;
  /** Projection for every day until the exam. */
  days: ExamDayPlan[];
}

/** Inputs about today's activity, derived from review logs. */
export interface ExamActivity {
  /** Cards of this exam that were introduced (first reviewed) today. */
  introducedToday: number;
  /** Correct answers (rating ≥ 2) on cards of this exam today. */
  correctToday: number;
}

/** Ceil-divide work evenly across days (≥ 0). */
function quota(remaining: number, days: number): number {
  if (remaining <= 0) return 0;
  if (days <= 0) return remaining;
  return Math.ceil(remaining / days);
}

/**
 * Computes the window boundaries of an exam.
 *
 * @returns Exam day, start of the final review and number of final-review days.
 */
export function examWindows(exam: Exam, now: Timestamp, dayStartHour: number): {
  today: Timestamp;
  examDay: Timestamp;
  daysLeft: number;
  finalReviewStart: Timestamp;
  finalDays: number;
} {
  const today = startOfStudyDay(now, dayStartHour);
  const examDay = startOfStudyDay(exam.date, dayStartHour);
  const daysLeft = Math.max(0, studyDaysBetween(now, exam.date, dayStartHour));
  let finalDays = 0;
  if (exam.finalReview && exam.finalReviewDays > 0) {
    // On the exam day itself the remaining time is the final review.
    finalDays = daysLeft === 0 ? 1 : Math.min(exam.finalReviewDays, daysLeft);
  }
  const finalReviewStart = daysLeft === 0 && finalDays > 0 ? today : addStudyDays(examDay, -finalDays, dayStartHour);
  return { today, examDay, daysLeft, finalReviewStart, finalDays };
}

/**
 * Builds the study plan of an exam.
 *
 * @param exam The exam.
 * @param cards States of all (enabled) cards in the exam scope.
 * @param activity Today's activity on those cards.
 * @param now Current time.
 * @param dayStartHour Study-day boundary.
 * @param scheduler Algorithm used to project future reviews (answers are
 *   assumed to be "Recalled with effort").
 */
export function planExam(
  exam: Exam,
  cards: readonly CardState[],
  activity: ExamActivity,
  now: Timestamp,
  dayStartHour: number,
  scheduler: Scheduler,
): ExamPlan {
  const { today, examDay, daysLeft, finalReviewStart, finalDays } = examWindows(exam, now, dayStartHour);
  const tomorrow = addStudyDays(today, 1, dayStartHour);
  const totalCards = cards.length;
  const newCards = cards.filter((c) => c.phase === 'new');
  const newRemaining = newCards.length;
  const learnedCards = cards.filter((c) => c.phase === 'review' || (c.phase === 'relearning' && c.lapses > 0)).length;
  const overdueBacklog = cards.filter((c) => c.phase !== 'new' && c.due < today).length;

  let status: ExamStatus;
  if (exam.archived) status = 'archived';
  else if (exam.date <= now) status = 'past';
  else if (daysLeft === 0) status = 'exam-day';
  else if (today >= finalReviewStart) status = 'final-review';
  else status = 'learning';

  const active = status !== 'past' && status !== 'archived';
  const learningDays = Math.max(0, studyDaysBetween(today, finalReviewStart, dayStartHour));

  // --- today ---------------------------------------------------------------
  let todayNewQuota = 0;
  if (active) {
    if (exam.newCardMode === 'due-now' || learningDays === 0) {
      todayNewQuota = newRemaining;
    } else {
      todayNewQuota = Math.max(0, quota(newRemaining + activity.introducedToday, learningDays) - activity.introducedToday);
      todayNewQuota = Math.min(todayNewQuota, newRemaining);
    }
  }
  const dueToday = active ? cards.filter((c) => c.phase !== 'new' && c.due < tomorrow) : [];
  const todayDueReviews = dueToday.length;

  let todayFinalReviewQuota = 0;
  if (active && finalDays > 0 && today >= finalReviewStart) {
    const finalDaysLeft = Math.max(1, studyDaysBetween(today, examDay, dayStartHour) + (daysLeft === 0 ? 1 : 0));
    const pending = cards.filter((c) => c.phase !== 'new' && (c.lastReview ?? 0) < finalReviewStart && c.due >= tomorrow).length;
    const doneInWindowToday = cards.filter((c) => c.phase !== 'new' && (c.lastReview ?? 0) >= today && (c.lastReview ?? 0) >= finalReviewStart).length;
    todayFinalReviewQuota = Math.max(0, Math.min(pending, quota(pending + doneInWindowToday, finalDaysLeft) - doneInWindowToday));
  }

  const todayTarget = todayNewQuota + todayDueReviews + todayFinalReviewQuota + activity.correctToday;
  const onTrack = overdueBacklog === 0;

  // --- projection ------------------------------------------------------------
  const days: ExamDayPlan[] = [];
  const horizon = active ? Math.max(0, studyDaysBetween(today, examDay, dayStartHour)) : -1;
  const reviewsPerDay = new Array<number>(horizon + 1).fill(0);
  const finalPerDay = new Array<number>(horizon + 1).fill(0);
  const newPerDay = new Array<number>(horizon + 1).fill(0);
  if (horizon >= 0) {
    const endOfPlan = examDay; // projections stop at the start of exam day
    /** Cards whose last projected review happens before the final window. */
    const pendingFinal: CardState[] = [];
    /** Simulates "Recalled with effort" answers from `state` until the exam. */
    const project = (state: CardState, start: Timestamp): void => {
      let s = state;
      let t = Math.max(start, s.due);
      let lastDayIndex = -1;
      for (let guard = 0; guard < 64 && t < endOfPlan; guard++) {
        const idx = Math.max(0, studyDaysBetween(today, t, dayStartHour));
        if (idx > horizon) break;
        if (idx !== lastDayIndex) reviewsPerDay[idx]! += 1;
        lastDayIndex = idx;
        s = scheduler.review(s, 3, t);
        t = s.due;
      }
      if (finalDays > 0 && (s.lastReview ?? 0) < finalReviewStart) pendingFinal.push(s);
    };

    // Existing (non-new) cards.
    for (const c of cards) {
      if (c.phase !== 'new') project(c, today);
    }
    // New cards, introduced according to the daily quota.
    let remaining = newRemaining;
    const newQueue = [...newCards];
    for (let d = 0; d <= horizon && remaining > 0; d++) {
      const day = addStudyDays(today, d, dayStartHour);
      const left = Math.max(0, studyDaysBetween(day, finalReviewStart, dayStartHour));
      const n = d === 0 ? todayNewQuota : exam.newCardMode === 'due-now' || left === 0 ? remaining : quota(remaining, left);
      newPerDay[d] = Math.min(n, remaining);
      for (let k = 0; k < newPerDay[d]!; k++) {
        const card = newQueue.shift();
        if (!card) break;
        // Learning steps happen on the day of introduction; projection starts with the first real review.
        const morning = day + 9 * 3600 * 1000;
        const learned = scheduler.review(scheduler.review(card, 3, morning), 3, morning + 10 * MINUTE);
        project(learned, learned.due);
      }
      remaining -= newPerDay[d]!;
    }

    // Distribute final reviews over the final window.
    if (finalDays > 0) {
      const firstFinalIdx = Math.max(0, studyDaysBetween(today, finalReviewStart, dayStartHour));
      const windowDays = Math.max(1, horizon - firstFinalIdx + (daysLeft === 0 ? 1 : 0));
      let left = pendingFinal.length;
      for (let d = firstFinalIdx; d <= horizon && left > 0; d++) {
        const daysRemaining = Math.max(1, windowDays - (d - firstFinalIdx));
        const n = d === 0 ? Math.min(left, todayFinalReviewQuota || quota(left, daysRemaining)) : quota(left, daysRemaining);
        finalPerDay[d] = n;
        left -= n;
      }
    }

    for (let d = 0; d <= horizon; d++) {
      const day = addStudyDays(today, d, dayStartHour);
      days.push({
        day,
        newCards: d === 0 ? todayNewQuota : newPerDay[d]!,
        reviews: d === 0 ? todayDueReviews : reviewsPerDay[d]!,
        finalReview: d === 0 ? todayFinalReviewQuota : finalPerDay[d]!,
        phase: day >= examDay ? 'exam' : day >= finalReviewStart ? 'final-review' : 'learning',
      });
    }
  }

  return {
    exam,
    status,
    examDay,
    finalReviewStart,
    daysLeft,
    totalCards,
    newRemaining,
    learnedCards,
    overdueBacklog,
    todayNewQuota,
    todayDueReviews,
    todayFinalReviewQuota,
    todayTarget,
    todayDone: activity.correctToday,
    onTrack,
    days,
  };
}

/** Delay before an extra-practice repetition. */
export const EXTRA_PRACTICE_DELAY = 10 * MINUTE;

/**
 * Applies exam rules to a freshly computed state.
 *
 * With *extra practice*, a card leaving (re)learning must have been recalled
 * successfully at least twice in a row; otherwise it stays in (re)learning and
 * comes back after a short delay.
 *
 * @param prev State before the review.
 * @param next State computed by the regular algorithm.
 * @param exam Exam the card belongs to.
 * @param now Review time.
 */
export function applyExamPolicy(prev: CardState, next: CardState, exam: Exam, now: Timestamp): CardState {
  const leavingStepPhase = prev.phase !== 'review' && next.phase === 'review';
  if (exam.extraPractice && leavingStepPhase && next.streak < 2) {
    const phase = prev.phase === 'relearning' ? 'relearning' : 'learning';
    return { ...next, phase, due: now + EXTRA_PRACTICE_DELAY };
  }
  // Never schedule the next review after the exam when a final review is
  // disabled: the last chance to review is the day before the exam.
  if (!exam.finalReview && next.due > exam.date && exam.date > now) {
    const lastChance = exam.date - DAY;
    if (lastChance > now) return { ...next, due: Math.max(now, lastChance) };
  }
  return next;
}
