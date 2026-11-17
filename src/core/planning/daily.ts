/**
 * Daily study tasks: turns a day's practice queue into one task per course
 * ("Vorlesung") with an estimated duration - the input for task managers
 * such as Todoist (see `docs/integrations.md`).
 *
 * Pure functions only. The data layer builds the queue for each day with the
 * same scheduler logic as the practice screen (exam quotas, priorities, new
 * card limits) and passes it here.
 */
import type { RemGraph } from '../model/graph';
import { ancestors } from '../model/graph';
import type { CardId, RemId, ReviewLog } from '../model/types';
import type { QueuedCard } from '../scheduling/queue';
import { toPlainText } from '../richtext/ops';
import { DAY } from '../util/time';

/** How long practice takes, learned from the review history. */
export interface TimeEstimate {
  /** Average seconds per answer. */
  secondsPerAnswer: number;
  /** Answers a new card needs on its first day (learning steps). */
  answersPerNewCard: number;
  /** Answers a due review needs on average (incl. relearning after lapses). */
  answersPerReview: number;
}

/** Defaults when there is no history yet. */
export const DEFAULT_ESTIMATE: TimeEstimate = {
  secondsPerAnswer: 15,
  answersPerNewCard: 3,
  answersPerReview: 1.2,
};

/** A course/lecture group of cards. */
export interface TaskGroup {
  id: RemId;
  title: string;
}

/** The study task of one course on one day. */
export interface DailyTask {
  /** Stable key (the course Rem id) - used to update instead of duplicate tasks. */
  key: string;
  /** Local date (YYYY-MM-DD). */
  date: string;
  course: string;
  reviews: number;
  newCards: number;
  /** Cards scheduled because of exams (subset of reviews + newCards). */
  examCards: number;
  /** Names of the exams involved. */
  exams: string[];
  minutes: number;
  /** Task title. */
  content: string;
  /** Task description (Markdown). */
  description: string;
}

/**
 * Learns the time estimate from review logs (most recent `n`).
 *
 * @param logs Review logs (any order).
 * @param n Number of recent logs to consider.
 */
export function estimateFromLogs(logs: readonly ReviewLog[], n = 1000): TimeEstimate {
  const recent = [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt).slice(-n);
  const timed = recent.filter((l) => l.durationMs > 0 && l.durationMs < 5 * 60_000);
  const secondsPerAnswer =
    timed.length >= 10
      ? timed.reduce((s, l) => s + l.durationMs, 0) / timed.length / 1000
      : DEFAULT_ESTIMATE.secondsPerAnswer;

  // Answers within one day after a card was introduced / reviewed.
  const byCard = new Map<CardId, ReviewLog[]>();
  for (const l of recent) byCard.set(l.cardId, [...(byCard.get(l.cardId) ?? []), l]);
  const perStart = (phase: 'new' | 'review'): number | null => {
    const counts: number[] = [];
    for (const list of byCard.values()) {
      list.forEach((l, i) => {
        if (l.before.phase !== phase) return;
        let k = 1;
        while (
          list[i + k] &&
          list[i + k]!.reviewedAt - l.reviewedAt < DAY &&
          list[i + k]!.before.phase !== 'review'
        )
          k++;
        counts.push(k);
      });
    }
    return counts.length >= 5 ? counts.reduce((a, b) => a + b, 0) / counts.length : null;
  };
  return {
    secondsPerAnswer: Math.min(120, Math.max(3, secondsPerAnswer)),
    answersPerNewCard: Math.min(
      8,
      Math.max(1, perStart('new') ?? DEFAULT_ESTIMATE.answersPerNewCard),
    ),
    answersPerReview: Math.min(
      4,
      Math.max(1, perStart('review') ?? DEFAULT_ESTIMATE.answersPerReview),
    ),
  };
}

/**
 * Estimated minutes, rounded up to 5 (at least 5).
 *
 * @param reviews Due reviews (incl. learning cards).
 * @param newCards New cards.
 * @param est Time estimate.
 */
export function estimateMinutes(reviews: number, newCards: number, est: TimeEstimate): number {
  const seconds =
    (reviews * est.answersPerReview + newCards * est.answersPerNewCard) * est.secondsPerAnswer;
  return Math.max(5, Math.ceil(seconds / 60 / 5) * 5);
}

/**
 * The course a Rem belongs to: its nearest folder, else its top-level
 * document (a slide deck inside a course folder belongs to the course).
 */
export function courseOf(graph: RemGraph, remId: RemId): TaskGroup | undefined {
  const rem = graph.get(remId);
  if (!rem) return undefined;
  const chain = [...ancestors(graph, remId), rem];
  const folder = [...chain].reverse().find((r) => r.isFolder);
  const group = folder ?? chain.find((r) => r.isDocument) ?? chain[0]!;
  return { id: group.id, title: toPlainText(group.text) || 'Ohne Titel' };
}

/** Options of {@link buildDailyTasks}. */
export interface DailyTaskOptions {
  date: string;
  /** Rem of a queued card. */
  remOf: (cardId: CardId) => RemId | undefined;
  /** Group of a Rem (default: {@link courseOf}). */
  groupOf: (remId: RemId) => TaskGroup | undefined;
  examName: (examId: string) => string | undefined;
  estimate: TimeEstimate;
  /**
   * Expected seconds per answer of a card (e.g. its own measured time, or its
   * course's); defaults to `estimate.secondsPerAnswer`.
   */
  secondsOf?: (cardId: CardId) => number | undefined;
  /** Builds a practice link for a group (optional). */
  practiceUrl?: (groupId: RemId) => string;
  /** Title template; `{course}` and `{minutes}` are replaced. */
  titleTemplate?: string;
}

/** Default task title. */
export const DEFAULT_TITLE_TEMPLATE = '{course} lernen (~{minutes} min)';

/**
 * Groups a day's queue into one task per course.
 *
 * @param queue The queue of the day.
 * @param opts Mapping and formatting options.
 * @returns Tasks sorted by duration (longest first).
 */
export function buildDailyTasks(queue: readonly QueuedCard[], opts: DailyTaskOptions): DailyTask[] {
  const groups = new Map<
    string,
    {
      group: TaskGroup;
      reviews: number;
      newCards: number;
      examCards: number;
      exams: Set<string>;
      /** Expected answers and seconds of the group's cards. */
      answers: number;
      seconds: number;
    }
  >();
  for (const q of queue) {
    const remId = opts.remOf(q.cardId);
    const group = remId ? opts.groupOf(remId) : undefined;
    if (!group) continue;
    const g = groups.get(group.id) ?? {
      group,
      reviews: 0,
      newCards: 0,
      examCards: 0,
      exams: new Set<string>(),
      answers: 0,
      seconds: 0,
    };
    const isNew = q.bucket === 'exam-new' || q.bucket === 'active-new' || q.bucket === 'none-new';
    if (isNew) g.newCards++;
    else g.reviews++;
    // A card's own pace (measured while practising) when known.
    const answers = isNew ? opts.estimate.answersPerNewCard : opts.estimate.answersPerReview;
    const perAnswer = opts.secondsOf?.(q.cardId) ?? opts.estimate.secondsPerAnswer;
    g.answers += answers;
    g.seconds += answers * perAnswer;
    if (q.examId) {
      g.examCards++;
      const name = opts.examName(q.examId);
      if (name) g.exams.add(name);
    }
    groups.set(group.id, g);
  }
  const template = opts.titleTemplate ?? DEFAULT_TITLE_TEMPLATE;
  return [...groups.values()]
    .map((g): DailyTask => {
      const minutes = Math.max(5, Math.ceil(g.seconds / 60 / 5) * 5);
      const perAnswer = g.answers ? g.seconds / g.answers : opts.estimate.secondsPerAnswer;
      const exams = [...g.exams];
      const lines = [
        `${g.reviews} Wiederholungen, ${g.newCards} neue Karten`,
        ...(exams.length ? [`Prüfung: ${exams.join(', ')} (${g.examCards} Karten)`] : []),
        `Schätzung: ~${minutes} min (Ø ${Math.round(perAnswer)} s pro Antwort bei diesen Karten)`,
        ...(opts.practiceUrl ? [`[In RemCraft üben](${opts.practiceUrl(g.group.id)})`] : []),
      ];
      return {
        key: g.group.id,
        date: opts.date,
        course: g.group.title,
        reviews: g.reviews,
        newCards: g.newCards,
        examCards: g.examCards,
        exams,
        minutes,
        content: template
          .replaceAll('{course}', g.group.title)
          .replaceAll('{minutes}', String(minutes)),
        description: lines.join('\n'),
      };
    })
    .sort((a, b) => b.minutes - a.minutes || a.course.localeCompare(b.course));
}
