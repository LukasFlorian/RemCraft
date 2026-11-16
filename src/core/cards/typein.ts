/**
 * Grading of typed answers ("Type in Answer" powerup).
 */
import type { Rating } from '../model/types';

/** Result of grading a typed answer. */
export interface TypeInResult {
  /** Similarity in [0, 1] (1 = identical after normalisation). */
  similarity: number;
  correct: boolean;
  /** Rating suggested to the user (they can still override it). */
  suggestedRating: Rating;
}

/**
 * Edit distance with adjacent transpositions (optimal string alignment /
 * restricted Damerau-Levenshtein): typical typos like "teh" -> "the" cost 1.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Three rolling rows: i-2, i-1 and i.
  let prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2]! + 1); // transposition
      }
      cur[j] = v;
    }
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return prev[b.length]!;
}

/** Normalises an answer for lenient comparison (case, accents, punctuation, spacing). */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Grades a typed answer.
 *
 * - `exact`: correct only when equal after trimming.
 * - `lenient`: case/accents/punctuation are ignored and small typos (≥ 85 %
 *   similarity) still count as correct; ≥ 60 % suggests "Partially recalled".
 *
 * @param expected Expected answer.
 * @param typed User input.
 * @param mode Grading mode.
 */
export function gradeTypedAnswer(
  expected: string,
  typed: string,
  mode: 'exact' | 'lenient' = 'lenient',
): TypeInResult {
  if (mode === 'exact') {
    const correct = expected.trim() === typed.trim();
    return { similarity: correct ? 1 : 0, correct, suggestedRating: correct ? 3 : 1 };
  }
  const a = normalizeAnswer(expected);
  const b = normalizeAnswer(typed);
  const longest = Math.max(a.length, b.length);
  const similarity = longest === 0 ? 1 : 1 - editDistance(a, b) / longest;
  if (similarity >= 0.999) return { similarity, correct: true, suggestedRating: 3 };
  if (similarity >= 0.85) return { similarity, correct: true, suggestedRating: 3 };
  if (similarity >= 0.6) return { similarity, correct: false, suggestedRating: 2 };
  return { similarity, correct: false, suggestedRating: 1 };
}
