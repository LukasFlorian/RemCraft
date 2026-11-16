/**
 * Descriptive statistics of a lecture (Fokus `analytics.py`): time and
 * attention per slide, headline numbers and the attention timeline.
 */
import type { LectureSettings, Timestamp } from '../model/types';
import type { LectureState } from './session';
import {
  activeDuration,
  closedIntervals,
  isRunning,
  overlap,
  slideAt,
  summarize,
  toActive,
} from './session';

/** Default lecture-mode settings (Fokus `config.example.toml`). */
export const DEFAULT_LECTURE_SETTINGS: LectureSettings = {
  checkinMinutes: 10,
  trackAway: true,
  awayMinSeconds: 3,
  welcomeBackSeconds: 45,
  minDwellSeconds: 8,
  missedMinSeconds: 30,
  missedRatio: 0.3,
  longDwellSeconds: 180,
};

/** Per-slide observations. */
export interface SlideStats {
  slide: number;
  dwellMs: number;
  visits: number;
  awayMs: number;
  drifts: number;
  checkins: { t: Timestamp; text: string; focus: number | null; prompt: string }[];
}

/** Stretches between navigation events `(start, end, slide)`. */
export function visits(st: LectureState, now: Timestamp): [Timestamp, Timestamp, number][] {
  if (st.slides.length === 0) return [];
  const starts = st.slides.map(([t]) => t);
  const last = Math.max(isRunning(st) ? now : st.lastT, starts[starts.length - 1]!);
  return st.slides.map(([t, slide], i) => [t, starts[i + 1] ?? last, slide]);
}

/**
 * Time, attention signals and check-in answers per slide.
 *
 * @param st Lecture state.
 * @param slideCount Number of slides of the deck.
 * @param now Reference time.
 */
export function slideStats(st: LectureState, slideCount: number, now: Timestamp): SlideStats[] {
  const stats: SlideStats[] = Array.from({ length: slideCount }, (_, slide) => ({
    slide,
    dwellMs: 0,
    visits: 0,
    awayMs: 0,
    drifts: 0,
    checkins: [],
  }));
  const shown = visits(st, now).filter(([, , p]) => p >= 0 && p < slideCount);
  for (const [a, b, p] of shown) {
    const dwell = overlap(st, a, b, now);
    stats[p]!.dwellMs += dwell;
    if (dwell >= 1000) stats[p]!.visits++;
  }
  // Away stretches are split over the slides shown meanwhile.
  for (const away of st.away) {
    for (const [va, vb, p] of shown) {
      const lo = Math.max(away.start, va);
      const hi = Math.min(away.end, vb);
      if (hi > lo) stats[p]!.awayMs += overlap(st, lo, hi, now);
    }
  }
  for (const d of st.drifts) {
    const p = d.slide ?? slideAt(st, d.t);
    if (p !== null && p >= 0 && p < slideCount) stats[p]!.drifts++;
  }
  for (const c of st.checkins) {
    if (
      c.answeredT !== null &&
      !c.skipped &&
      c.text.trim() &&
      c.slide !== null &&
      c.slide >= 0 &&
      c.slide < slideCount
    ) {
      stats[c.slide]!.checkins.push({
        t: c.answeredT,
        text: c.text,
        focus: c.focus,
        prompt: c.prompt,
      });
    }
  }
  return stats;
}

/** Headline numbers of a lecture. */
export interface LectureKpis {
  durationMs: number;
  trackAway: boolean;
  focusRatio: number | null;
  awayMs: number;
  awayCount: number;
  longestAwayMs: number;
  drifts: number;
  checkins: number;
  checkinsAnswered: number;
  focusAvg: number | null;
  noteEdits: number;
  slidesSeen: number;
  /** Mean time per covered slide. */
  paceMs: number | null;
}

/** Computes the KPIs of a lecture. */
export function lectureKpis(
  st: LectureState,
  cfg: LectureSettings,
  slideCount: number | null,
  now: Timestamp,
): LectureKpis {
  const s = summarize(st, now);
  const spans = st.away.map((a) => overlap(st, a.start, a.end, now));
  const answered = st.checkins.filter((c) => c.answeredT !== null && !c.skipped);
  const ratings = answered
    .map((c) => c.focus)
    .filter((f): f is number => typeof f === 'number' && f > 0);
  let slidesSeen = 0;
  let paceMs: number | null = null;
  if (slideCount) {
    const covered = slideStats(st, slideCount, now)
      .map((x) => x.dwellMs)
      .filter((d) => d >= cfg.minDwellSeconds * 1000);
    slidesSeen = covered.length;
    paceMs = covered.length ? covered.reduce((a, b) => a + b, 0) / covered.length : null;
  }
  return {
    durationMs: s.durationMs,
    trackAway: st.trackAway,
    focusRatio: s.focusRatio,
    awayMs: s.awayMs,
    awayCount: spans.length,
    longestAwayMs: Math.max(0, ...spans),
    drifts: st.drifts.length,
    checkins: st.checkins.length,
    checkinsAnswered: answered.length,
    focusAvg: ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
      : null,
    noteEdits: st.noteEdits,
    slidesSeen,
    paceMs,
  };
}

/** Attention per active minute. */
export interface Timeline {
  minutes: number;
  /** Seconds outside the app per minute (≤ 60). */
  awaySeconds: number[];
  /** Minute positions of noticed drifts. */
  drifts: number[];
  checkins: {
    minute: number;
    focus: number | null;
    skipped: boolean;
    text: string;
    prompt: string;
  }[];
  /** Slide shown in the middle of each minute. */
  slide: (number | null)[];
}

/** Builds the attention timeline. */
export function timeline(st: LectureState, now: Timestamp): Timeline {
  const duration = activeDuration(st, now);
  const n = Math.max(1, Math.ceil(duration / 60_000));
  const away = new Array<number>(n).fill(0);
  for (const a of st.away) {
    for (const [s, e] of closedIntervals(st, now)) {
      const lo = Math.max(a.start, s);
      const hi = Math.min(a.end, e);
      if (hi <= lo) continue;
      const x0 = toActive(st, lo, now, true);
      const x1 = toActive(st, hi, now, true);
      for (let m = Math.floor(x0 / 60_000); m <= Math.min(n - 1, Math.floor(x1 / 60_000)); m++) {
        away[m]! += Math.max(0, Math.min(x1, (m + 1) * 60_000) - Math.max(x0, m * 60_000)) / 1000;
      }
    }
  }
  const drifts = st.drifts
    .map((d) => toActive(st, d.t, now))
    .filter((x) => !Number.isNaN(x))
    .map((x) => Math.round((x / 60_000) * 100) / 100);
  const checkins = st.checkins
    .filter((c) => c.answeredT !== null)
    .map((c) => ({
      minute: Math.round((toActive(st, c.answeredT!, now, true) / 60_000) * 100) / 100,
      focus: c.focus,
      skipped: c.skipped,
      text: c.text,
      prompt: c.prompt,
    }));
  // Slide shown in the middle of each minute (inverse of the active-time mapping).
  const slide: (number | null)[] = [];
  const intervals = closedIntervals(st, now);
  for (let m = 0; m < n; m++) {
    let target = (m + 0.5) * 60_000;
    let wall: number | null = null;
    for (const [s, e] of intervals) {
      if (target <= e - s) {
        wall = s + target;
        break;
      }
      target -= e - s;
    }
    slide.push(wall === null ? null : slideAt(st, wall));
  }
  return {
    minutes: n,
    awaySeconds: away.map((v) => Math.round(Math.min(60, v) * 10) / 10),
    drifts,
    checkins,
    slide,
  };
}

/** Sums the slide statistics of several lectures with the same deck. */
export function mergeStats(perLecture: SlideStats[][]): SlideStats[] {
  const first = perLecture[0];
  if (!first) return [];
  const merged = first.map((s) => ({
    ...s,
    dwellMs: 0,
    visits: 0,
    awayMs: 0,
    drifts: 0,
    checkins: [] as SlideStats['checkins'],
  }));
  for (const stats of perLecture) {
    stats.forEach((s, i) => {
      const m = merged[i];
      if (!m) return;
      m.dwellMs += s.dwellMs;
      m.visits += s.visits;
      m.awayMs += s.awayMs;
      m.drifts += s.drifts;
      m.checkins.push(...s.checkins);
    });
  }
  return merged;
}
