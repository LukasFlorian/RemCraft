import type { ReviewLog } from '../model/types';
import { cardTimes, hardestCards } from './cardTimes';

/** Minimal review log. */
function log(cardId: string, at: number, seconds: number, rating: 1 | 2 | 3 | 4 = 3): ReviewLog {
  return { cardId, reviewedAt: at, durationMs: seconds * 1000, rating } as ReviewLog;
}

describe('cardTimes', () => {
  const logs = [
    log('a', 1, 10),
    log('a', 2, 20),
    log('a', 3, 600), // interruption: ignored for the average
    log('b', 1, 40, 1),
    log('b', 2, 30, 1),
    log('c', 1, 5),
    log('c', 2, 5),
  ];

  it('averages recent answer times and counts lapses', () => {
    const t = cardTimes(logs);
    expect(t.get('a')).toMatchObject({ answers: 3, timed: 2, avgSeconds: 15, forgot: 0 });
    expect(t.get('b')).toMatchObject({ answers: 2, avgSeconds: 35, forgot: 2 });
  });

  it('ranks slow and often forgotten cards first', () => {
    expect(hardestCards(cardTimes(logs)).map((t) => t.cardId)).toEqual(['b', 'a', 'c']);
  });
});
