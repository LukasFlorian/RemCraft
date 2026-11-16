/**
 * Lecture state derived from its event log (event sourcing, ported from
 * Fokus `session.py`). All times are wall-clock milliseconds.
 *
 * The *active* time axis excludes pauses: recording intervals are the stretches
 * between `start` and `stop` events.
 */
import type { LectureEvent, Timestamp } from '../model/types';

/** A recall check-in: the prompt and (if given) the answer. */
export interface Checkin {
  id: string;
  t: Timestamp;
  prompt: string;
  answeredT: Timestamp | null;
  text: string;
  focus: number | null;
  skipped: boolean;
  slide: number | null;
}

/** Everything derived from the events of one lecture. */
export interface LectureState {
  /** Recording intervals `[start, stop | null]`. */
  intervals: [Timestamp, Timestamp | null][];
  /** Navigation `(t, slide)` in chronological order. */
  slides: [Timestamp, number][];
  goal: string;
  summary: string;
  away: { start: Timestamp; end: Timestamp; slide: number | null }[];
  drifts: { t: Timestamp; slide: number | null }[];
  checkins: Checkin[];
  /** Away tracking was on at some point (otherwise no focus ratio). */
  trackAway: boolean;
  noteEdits: number;
  lastT: Timestamp;
  /** Start of the current break, `null` when not paused. */
  pausedSince: Timestamp | null;
}

/** Order of events with identical timestamps (start before slide before stop). */
const ORDER: Partial<Record<LectureEvent['type'], number>> = { start: 0, stop: 2 };

/**
 * Replays events into a {@link LectureState}.
 *
 * @param events Events of one lecture in any order.
 */
export function buildLectureState(events: readonly LectureEvent[]): LectureState {
  const st: LectureState = { intervals: [], slides: [], goal: '', summary: '', away: [], drifts: [], checkins: [], trackAway: false, noteEdits: 0, lastT: 0, pausedSince: null };
  const sorted = [...events].sort((a, b) => a.t - b.t || (ORDER[a.type] ?? 1) - (ORDER[b.type] ?? 1) || a.id.localeCompare(b.id));
  const running = (): boolean => st.intervals.length > 0 && st.intervals[st.intervals.length - 1]![1] === null;
  const byId = new Map<string, Checkin>();
  for (const ev of sorted) {
    st.lastT = Math.max(st.lastT, ev.t);
    switch (ev.type) {
      case 'start':
        if (!running()) st.intervals.push([ev.t, null]);
        st.pausedSince = null;
        break;
      case 'stop':
        if (running()) st.intervals[st.intervals.length - 1]![1] = ev.t;
        st.pausedSince = ev.pause ? ev.t : null;
        break;
      case 'slide':
        if (ev.slide !== undefined) st.slides.push([ev.t, ev.slide]);
        break;
      case 'focus':
        st.trackAway = st.trackAway || Boolean(ev.trackAway);
        break;
      case 'goal':
        st.goal = ev.text ?? '';
        break;
      case 'summary':
        st.summary = ev.text ?? '';
        break;
      case 'away':
        if (ev.start !== undefined && ev.end !== undefined) st.away.push({ start: ev.start, end: ev.end, slide: ev.slide ?? null });
        break;
      case 'drift':
        st.drifts.push({ t: ev.t, slide: ev.slide ?? null });
        break;
      case 'checkin_prompt': {
        const c: Checkin = { id: ev.id, t: ev.t, prompt: ev.text ?? '', answeredT: null, text: '', focus: null, skipped: false, slide: null };
        byId.set(ev.id, c);
        st.checkins.push(c);
        break;
      }
      case 'checkin': {
        const c = byId.get(ev.ref ?? '');
        if (c) Object.assign(c, { answeredT: ev.t, text: ev.text ?? '', skipped: Boolean(ev.skipped), focus: ev.focus ?? null, slide: ev.slide ?? null });
        break;
      }
      case 'note':
        st.noteEdits++;
        break;
      case 'flag':
        break;
    }
  }
  return st;
}

/** True while recording (last interval open). */
export function isRunning(st: LectureState): boolean {
  return st.intervals.length > 0 && st.intervals[st.intervals.length - 1]![1] === null;
}

/** Recording intervals with the open one closed at `now`. */
export function closedIntervals(st: LectureState, now: Timestamp): [Timestamp, Timestamp][] {
  return st.intervals.map(([s, e]) => [s, e ?? now]);
}

/** Total recorded milliseconds (pauses excluded). */
export function activeDuration(st: LectureState, now: Timestamp): number {
  return closedIntervals(st, now).reduce((sum, [s, e]) => sum + Math.max(0, e - s), 0);
}

/** Milliseconds of `[a, b]` inside recording intervals. */
export function overlap(st: LectureState, a: Timestamp, b: Timestamp, now: Timestamp): number {
  return closedIntervals(st, now).reduce((sum, [s, e]) => sum + Math.max(0, Math.min(b, e) - Math.max(a, s)), 0);
}

/**
 * Maps a wall-clock time to active milliseconds since the lecture start
 * (flat during pauses).
 *
 * @param clamp When false, times inside a pause return `NaN`.
 */
export function toActive(st: LectureState, t: Timestamp, now: Timestamp, clamp = false): number {
  let offset = 0;
  for (const [s, e] of closedIntervals(st, now)) {
    if (t < s) return clamp ? offset : NaN;
    if (t <= e + 1000) return offset + Math.min(t, e) - s; // 1 s grace for events at a stop
    offset += e - s;
  }
  return clamp ? offset : NaN;
}

/** Slide shown at time `t` (`null` before the first navigation). */
export function slideAt(st: LectureState, t: Timestamp): number | null {
  let found: number | null = null;
  for (const [ts, slide] of st.slides) {
    if (ts > t) break;
    found = slide;
  }
  return found;
}

/** Most recently selected slide. */
export function currentSlide(st: LectureState): number | null {
  return st.slides.length ? st.slides[st.slides.length - 1]![1] : null;
}

/** The latest check-in if it is still unanswered. */
export function openCheckin(st: LectureState): Checkin | null {
  const last = st.checkins[st.checkins.length - 1];
  return last && last.answeredT === null ? last : null;
}

/** Time outside the app during recording (pauses excluded). */
export function awayDuration(st: LectureState, now: Timestamp): number {
  return st.away.reduce((sum, a) => sum + overlap(st, a.start, a.end, now), 0);
}

/** Small summary for lists. */
export interface LectureSummary {
  durationMs: number;
  awayMs: number;
  awayCount: number;
  /** Share of the lecture spent in the app (`null` without away tracking). */
  focusRatio: number | null;
  drifts: number;
  checkins: number;
  checkinsAnswered: number;
  running: boolean;
  paused: boolean;
  lastSlide: number | null;
  goal: string;
  hasSummary: boolean;
}

/** Summarises a lecture. */
export function summarize(st: LectureState, now: Timestamp): LectureSummary {
  const durationMs = activeDuration(st, now);
  const awayMs = awayDuration(st, now);
  return {
    durationMs,
    awayMs,
    awayCount: st.away.length,
    focusRatio: st.trackAway && durationMs > 0 ? Math.round((1 - awayMs / durationMs) * 1000) / 1000 : null,
    drifts: st.drifts.length,
    checkins: st.checkins.length,
    checkinsAnswered: st.checkins.filter((c) => c.answeredT !== null && !c.skipped).length,
    running: isRunning(st),
    paused: st.pausedSince !== null,
    lastSlide: currentSlide(st),
    goal: st.goal,
    hasSummary: st.summary.trim() !== '',
  };
}

/** Recall questions, rotated so they do not become routine (Fokus). */
export const CHECKIN_PROMPTS: readonly string[] = [
  'Was war der Kernpunkt der letzten Minuten? Ein Satz, ohne nachzusehen.',
  'Erklär die letzte Folie in eigenen Worten, als würdest du sie einer Kommilitonin erklären.',
  'Welche Klausurfrage könnte der Prof zu den letzten Minuten stellen?',
  'Wie hängt das gerade mit dem vorherigen Thema zusammen?',
  'Was davon ist dir noch nicht ganz klar?',
];

/**
 * Milliseconds until the next check-in is due (`null` when check-ins are off,
 * the lecture is not running or a check-in is still open). Counted from the
 * later of the last prompt and the start of the current recording interval,
 * so no check-in follows directly after a break.
 */
export function nextCheckinIn(st: LectureState, now: Timestamp, checkinMinutes: number): number | null {
  if (checkinMinutes <= 0 || !isRunning(st) || openCheckin(st)) return null;
  const lastPrompt = st.checkins.length ? st.checkins[st.checkins.length - 1]!.t : 0;
  const since = Math.max(lastPrompt, st.intervals[st.intervals.length - 1]![0]);
  return Math.max(0, since + checkinMinutes * 60_000 - now);
}

/** The prompt for the next check-in (rotating). */
export function nextCheckinPrompt(st: LectureState): string {
  return CHECKIN_PROMPTS[st.checkins.length % CHECKIN_PROMPTS.length]!;
}
