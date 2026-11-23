/**
 * "Nacharbeiten": which slides deserve another look, with transparent,
 * weighted reasons instead of an opaque score (Fokus `review.py`).
 *
 * | Reason                            | Weight |
 * |-----------------------------------|-------:|
 * | marked as unclear                 | 3      |
 * | open questions (`? …`)            | 2      |
 * | missed (outside the app)          | 2      |
 * | marked as important               | 1.5    |
 * | drifted off here                  | 1      |
 * | explained long, nothing noted     | 1      |
 * | flashcards forgotten last time    | 1.5    |
 *
 * Adding a reason = one more `if` in {@link reasons}.
 */
import type { LectureSettings, SlideFlag } from '../model/types';
import type { SlideStats } from './analytics';
import { t, tn } from '@core/i18n';

/** One review reason. */
export interface ReviewReason {
  key: 'unclear' | 'question' | 'missed' | 'important' | 'drift' | 'no_note' | 'cards';
  label: string;
  weight: number;
}

/** What the review needs to know about a slide besides the statistics. */
export interface SlideReviewInput {
  flags: SlideFlag[];
  openQuestions: string[];
  /** The slide has notes, drawings or text boxes. */
  hasNote: boolean;
  /** Flashcards of the slide whose last answer was "Forgot". */
  forgottenCards: number;
}

/** Formats milliseconds as `m:ss`. */
export function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Why a slide deserves another look. */
export function reasons(
  s: SlideStats,
  input: SlideReviewInput,
  longMs: number,
  cfg: LectureSettings,
): ReviewReason[] {
  const out: ReviewReason[] = [];
  if (input.flags.includes('unclear'))
    out.push({ key: 'unclear', label: t('marked as unclear'), weight: 3 });
  const q = input.openQuestions.length;
  if (q)
    out.push({
      key: 'question',
      label: tn('{n} open question', '{n} open questions', q),
      weight: 2,
    });
  const missed =
    s.awayMs >= cfg.missedMinSeconds * 1000 ||
    (s.dwellMs >= cfg.minDwellSeconds * 1000 &&
      s.awayMs >= 10_000 &&
      s.awayMs >= cfg.missedRatio * s.dwellMs);
  if (missed)
    out.push({
      key: 'missed',
      label: t('{0} not in the app', { '0': fmtDuration(s.awayMs) }),
      weight: 2,
    });
  if (input.flags.includes('important'))
    out.push({ key: 'important', label: t('marked as important'), weight: 1.5 });
  if (s.drifts)
    out.push({
      key: 'drift',
      label: t('drifted here ({drifts}×)', { drifts: s.drifts }),
      weight: 1,
    });
  if (s.dwellMs >= longMs && !input.hasNote)
    out.push({
      key: 'no_note',
      label: t('{0} explained, no note', { '0': fmtDuration(s.dwellMs) }),
      weight: 1,
    });
  if (input.forgottenCards)
    out.push({
      key: 'cards',
      label: tn('{n} card not known', '{n} cards not known', input.forgottenCards),
      weight: 1.5,
    });
  return out;
}

/** A review row of one slide. */
export interface ReviewRow {
  slide: number;
  stats: SlideStats;
  status: 'covered' | 'skipped' | 'unseen';
  reasons: ReviewReason[];
  /** Sum of the reason weights (0 = nothing to do). */
  priority: number;
}

/** Median of numbers. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * One row per slide with status and reasons.
 *
 * @param stats Slide statistics (merged over the lectures of interest).
 * @param inputs Flags, questions, notes and cards per slide index.
 * @param cfg Thresholds.
 */
export function reviewRows(
  stats: SlideStats[],
  inputs: (slide: number) => SlideReviewInput,
  cfg: LectureSettings,
): ReviewRow[] {
  // "Long" is relative to this lecture's pace: noticeably longer than a typical slide.
  const covered = stats.map((s) => s.dwellMs).filter((d) => d >= cfg.minDwellSeconds * 1000);
  const longMs = covered.length
    ? Math.max(cfg.longDwellSeconds * 1000, 1.5 * median(covered))
    : cfg.longDwellSeconds * 1000;
  return stats.map((s) => {
    const r = reasons(s, inputs(s.slide), longMs, cfg);
    const status =
      s.dwellMs >= cfg.minDwellSeconds * 1000 ? 'covered' : s.visits ? 'skipped' : 'unseen';
    return {
      slide: s.slide,
      stats: s,
      status,
      reasons: r,
      priority: Math.round(r.reduce((a, x) => a + x.weight, 0) * 100) / 100,
    };
  });
}

/** Rows worth reviewing, most important first. */
export function todo(rows: ReviewRow[]): ReviewRow[] {
  return rows
    .filter((r) => r.priority > 0)
    .sort((a, b) => b.priority - a.priority || a.slide - b.slide);
}
