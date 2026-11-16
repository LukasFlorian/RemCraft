import { editDistance, gradeTypedAnswer, normalizeAnswer } from './typein';

describe('type-in grading', () => {
  it('computes edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'ab')).toBe(2);
    expect(editDistance('teh', 'the')).toBe(1);
  });
  it('normalises', () => {
    expect(normalizeAnswer('  Ärger, über-All! ')).toBe('arger uber all');
  });
  it('grades leniently', () => {
    expect(gradeTypedAnswer('Mitochondria', 'mitochondria').correct).toBe(true);
    expect(gradeTypedAnswer('Mitochondria', 'mitochondira').correct).toBe(true);
    expect(gradeTypedAnswer('Mitochondria', 'mito').suggestedRating).toBe(1);
  });
  it('grades exactly', () => {
    expect(gradeTypedAnswer('Abc', 'abc', 'exact').correct).toBe(false);
    expect(gradeTypedAnswer('Abc', ' Abc ', 'exact').correct).toBe(true);
  });
});
