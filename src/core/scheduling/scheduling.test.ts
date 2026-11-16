import { createMemoryGraph } from '../model/graph';
import { createCardState, createDefaultScheduler, createExam, createRem } from '../model/factories';
import type { CardState, EffectivePriority } from '../model/types';
import { rt } from '../richtext/ops';
import { addStudyDays, DAY, HOUR, MINUTE, startOfStudyDay } from '../util/time';
import { applyExamPolicy, examWindows, planExam } from './exam';
import { resolveInheritance } from './inheritance';
import { buildDocumentQueue, buildGlobalQueue, countDue } from './queue';
import type { QueueEntry } from './queue';
import { createScheduler } from './scheduler';
import { PracticeSession } from './session';

const NOW = new Date(2026, 10, 16, 12).getTime(); // Mon 16 Nov 2026, noon
const scheduler = createScheduler({
  ...createDefaultScheduler(),
  sm2: { ...createDefaultScheduler().sm2, fuzz: false },
});

/** Card state helper. */
function card(id: string, patch: Partial<CardState> = {}): CardState {
  return { ...createCardState(id, id.split('/')[0]!, NOW - 30 * DAY), ...patch };
}

/** Queue entry helper. */
function entry(
  id: string,
  priority: EffectivePriority,
  state: Partial<CardState> = {},
  docOrder = 0,
  examIds: string[] = [],
): QueueEntry {
  return { cardId: id, remId: id, state: card(id, state), priority, examIds, docOrder };
}

describe('resolveInheritance', () => {
  const folder = createRem({ id: 'F', isFolder: true, priority: 'active', schedulerId: 'S1' });
  const doc = createRem({ id: 'D', parentId: 'F', isDocument: true });
  const paused = createRem({
    id: 'P',
    parentId: 'F',
    order: 'a1',
    isDocument: true,
    priority: 'paused',
  });
  const leaf = createRem({ id: 'L', parentId: 'D', text: rt('x') });
  const pausedLeaf = createRem({ id: 'PL', parentId: 'P', text: rt('y') });
  const other = createRem({ id: 'O', order: 'a2', isDocument: true });
  const graph = createMemoryGraph([folder, doc, paused, leaf, pausedLeaf, other]);

  it('inherits priority and scheduler', () => {
    const info = resolveInheritance(graph, [], NOW);
    expect(info.get('L')).toMatchObject({ priority: 'active', schedulerId: 'S1', examIds: [] });
    expect(info.get('PL')?.priority).toBe('paused');
    expect(info.get('O')?.priority).toBe('none');
  });

  it('applies exam priority except to paused subtrees and ignores past exams', () => {
    const exam = createExam({ id: 'E', date: NOW + 5 * DAY, scope: ['F'] });
    const info = resolveInheritance(graph, [exam], NOW);
    expect(info.get('L')).toMatchObject({ priority: 'exam', examIds: ['E'] });
    expect(info.get('PL')?.priority).toBe('paused');
    const past = createExam({ id: 'X', date: NOW - DAY, scope: ['F'] });
    expect(resolveInheritance(graph, [past], NOW).get('L')?.priority).toBe('active');
  });
});

describe('buildGlobalQueue', () => {
  const opts = {
    now: NOW,
    dayStartHour: 4,
    newCardsPerDay: 2,
    newIntroducedToday: 0,
    examQuotas: new Map(),
    retrievability: (e: QueueEntry) => scheduler.retrievability(e.state, NOW),
  };

  it('orders buckets: learning, exam, active, maintaining, none and skips paused', () => {
    const entries = [
      entry('none', 'none', {
        phase: 'review',
        due: NOW - DAY,
        interval: 3,
        lastReview: NOW - 4 * DAY,
      }),
      entry('maint', 'maintaining', {
        phase: 'review',
        due: NOW - DAY,
        interval: 3,
        lastReview: NOW - 4 * DAY,
      }),
      entry('act', 'active', {
        phase: 'review',
        due: NOW - HOUR,
        interval: 3,
        lastReview: NOW - 3 * DAY,
      }),
      entry('learn', 'none', {
        phase: 'learning',
        due: NOW + 5 * MINUTE,
        lastReview: NOW - 5 * MINUTE,
      }),
      entry(
        'ex',
        'exam',
        { phase: 'review', due: NOW, interval: 3, lastReview: NOW - 3 * DAY },
        0,
        ['E'],
      ),
      entry('paused', 'paused', { phase: 'review', due: NOW - DAY, interval: 3 }),
      entry('future', 'active', { phase: 'review', due: NOW + 5 * DAY, interval: 9 }),
    ];
    const q = buildGlobalQueue(entries, opts);
    expect(q.map((c) => c.cardId)).toEqual(['learn', 'ex', 'act', 'maint', 'none']);
  });

  it('limits new cards per day across active and no-priority', () => {
    const entries = [
      entry('n1', 'active', {}, 1),
      entry('n2', 'active', {}, 2),
      entry('n3', 'none', {}, 3),
    ];
    expect(buildGlobalQueue(entries, opts).map((c) => c.cardId)).toEqual(['n1', 'n2']);
    expect(
      buildGlobalQueue(entries, { ...opts, newIntroducedToday: 1 }).map((c) => c.cardId),
    ).toEqual(['n1']);
  });

  it('applies exam new-card and final-review quotas', () => {
    const entries = [
      entry('e1', 'exam', {}, 1, ['E']),
      entry('e2', 'exam', {}, 2, ['E']),
      entry(
        'e3',
        'exam',
        { phase: 'review', due: NOW + 9 * DAY, interval: 10, lastReview: NOW - DAY },
        3,
        ['E'],
      ),
    ];
    const q = buildGlobalQueue(entries, {
      ...opts,
      examQuotas: new Map([
        ['E', { newQuota: 1, finalReviewQuota: 1, finalReviewStart: startOfStudyDay(NOW) }],
      ]),
    });
    expect(q).toEqual([
      { cardId: 'e1', bucket: 'exam-new', examId: 'E' },
      { cardId: 'e3', bucket: 'exam-final', examId: 'E' },
    ]);
  });
});

describe('buildDocumentQueue', () => {
  const entries = [
    entry('b', 'paused', {}, 2),
    entry(
      'a',
      'paused',
      { phase: 'review', due: NOW - DAY, interval: 2, lastReview: NOW - 3 * DAY },
      1,
    ),
    entry('c', 'paused', { phase: 'review', due: NOW + 5 * DAY, interval: 9 }, 0),
  ];
  const opts = { now: NOW, dayStartHour: 4, retrievability: () => 0.5, rng: () => 0.1 };

  it('srs mode: due then new, includes paused', () => {
    expect(buildDocumentQueue(entries, 'srs', opts).map((c) => c.cardId)).toEqual(['a', 'b']);
  });
  it('in-order mode returns every card in document order', () => {
    expect(buildDocumentQueue(entries, 'all-in-order', opts).map((c) => c.cardId)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
  it('counts due cards including new ones', () => {
    expect(countDue(entries, NOW, 4)).toBe(2);
    expect(countDue(entries, NOW, 4, false)).toBe(1);
  });
});

describe('PracticeSession', () => {
  it('requeues learning cards and supports undo', () => {
    const s = new PracticeSession(['a', 'b']);
    expect(s.current(NOW)).toBe('a');
    s.answer('a', NOW + MINUTE, NOW);
    expect(s.current(NOW)).toBe('b');
    expect(s.current(NOW + 2 * MINUTE)).toBe('a');
    s.answer('b', NOW + 3 * DAY, NOW);
    expect(s.progress()).toEqual({ done: 2, remaining: 1, total: 3 });
    // Learn ahead when nothing else is left.
    expect(s.current(NOW)).toBe('a');
    s.answer('a', null, NOW);
    expect(s.isFinished()).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.isFinished()).toBe(false);
    expect(s.lastAnswered()).toBe('b');
  });

  it('skips to the end', () => {
    const s = new PracticeSession(['a', 'b']);
    s.skip('a');
    expect(s.current(NOW)).toBe('b');
  });
});

describe('exam planning', () => {
  const exam = createExam({ id: 'E', date: addStudyDays(NOW, 10) + 9 * HOUR, finalReviewDays: 2 });

  it('computes windows', () => {
    const w = examWindows(exam, NOW, 4);
    expect(w.daysLeft).toBe(10);
    expect(w.finalDays).toBe(2);
    expect(w.finalReviewStart).toBe(addStudyDays(NOW, 8));
  });

  it('spreads new cards evenly over the learning period', () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(`n${i}/f`));
    const plan = planExam(exam, cards, { introducedToday: 0, correctToday: 0 }, NOW, 4, scheduler);
    expect(plan.status).toBe('learning');
    expect(plan.todayNewQuota).toBe(5); // 40 cards / 8 learning days
    const totalNew = plan.days.reduce((s, d) => s + d.newCards, 0);
    expect(totalNew).toBe(40);
    expect(plan.days).toHaveLength(11);
    expect(plan.days.filter((d) => d.phase === 'final-review')).toHaveLength(2);
    expect(plan.days.slice(8, 10).reduce((s, d) => s + d.finalReview, 0)).toBeGreaterThan(0);
  });

  it('keeps the daily quota stable while learning during the day', () => {
    const cards = Array.from({ length: 35 }, (_, i) => card(`n${i}/f`));
    const plan = planExam(exam, cards, { introducedToday: 5, correctToday: 5 }, NOW, 4, scheduler);
    expect(plan.todayNewQuota).toBe(0); // ceil(40/8) - 5
    expect(plan.todayTarget).toBe(5 + plan.todayDueReviews);
  });

  it('makes all new cards due in due-now mode and when no learning days are left', () => {
    const cards = Array.from({ length: 7 }, (_, i) => card(`n${i}/f`));
    expect(
      planExam(
        { ...exam, newCardMode: 'due-now' },
        cards,
        { introducedToday: 0, correctToday: 0 },
        NOW,
        4,
        scheduler,
      ).todayNewQuota,
    ).toBe(7);
    const soon = { ...exam, date: addStudyDays(NOW, 1) + 9 * HOUR };
    expect(
      planExam(soon, cards, { introducedToday: 0, correctToday: 0 }, NOW, 4, scheduler)
        .todayNewQuota,
    ).toBe(7);
  });

  it('assigns final reviews during the final window', () => {
    const inWindow = addStudyDays(NOW, 9) + HOUR; // one day before the exam
    const reviewed = Array.from({ length: 6 }, (_, i) =>
      card(`r${i}/f`, {
        phase: 'review',
        interval: 30,
        due: inWindow + 20 * DAY,
        lastReview: NOW - DAY,
      }),
    );
    const plan = planExam(
      exam,
      reviewed,
      { introducedToday: 0, correctToday: 0 },
      inWindow,
      4,
      scheduler,
    );
    expect(plan.status).toBe('final-review');
    expect(plan.todayFinalReviewQuota).toBe(6);
  });

  it('flags a backlog as off-track and reports past exams', () => {
    const overdue = [
      card('o/f', { phase: 'review', interval: 3, due: NOW - 3 * DAY, lastReview: NOW - 6 * DAY }),
    ];
    expect(
      planExam(exam, overdue, { introducedToday: 0, correctToday: 0 }, NOW, 4, scheduler).onTrack,
    ).toBe(false);
    const past = { ...exam, date: NOW - DAY };
    expect(
      planExam(past, overdue, { introducedToday: 0, correctToday: 0 }, NOW, 4, scheduler).status,
    ).toBe('past');
  });
});

describe('applyExamPolicy', () => {
  const exam = createExam({ date: NOW + 10 * DAY, extraPractice: true });

  it('requires two consecutive successes before graduating', () => {
    const prev = card('c/f', { phase: 'learning', step: 1, streak: 0 });
    const next = card('c/f', { phase: 'review', streak: 1, due: NOW + DAY });
    const adjusted = applyExamPolicy(prev, next, exam, NOW);
    expect(adjusted.phase).toBe('learning');
    expect(adjusted.due).toBe(NOW + 10 * MINUTE);
    expect(applyExamPolicy(prev, { ...next, streak: 2 }, exam, NOW).phase).toBe('review');
  });

  it('caps intervals before the exam when no final review is planned', () => {
    const noFinal = { ...exam, finalReview: false };
    const prev = card('c/f', { phase: 'review', streak: 3 });
    const next = card('c/f', { phase: 'review', streak: 4, due: NOW + 30 * DAY });
    expect(applyExamPolicy(prev, next, noFinal, NOW).due).toBe(noFinal.date - DAY);
  });
});
