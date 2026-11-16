/**
 * Lecture hooks: state from the event log, settings, away tracking and the
 * check-in timer (ported from Fokus `presence.py`, `app.py`).
 */
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_LECTURE_SETTINGS } from '@core/lecture/analytics';
import type { LectureState } from '@core/lecture/session';
import { buildLectureState, currentSlide, isRunning, nextCheckinIn, nextCheckinPrompt } from '@core/lecture/session';
import type { Lecture, LectureEvent, LectureSettings } from '@core/model/types';
import { selectSettings } from '@data/selectors';
import type { Store } from '@data/store/store';
import { useApp, useSelector } from '../app/context';

/** Events grouped by lecture (memoised). */
function eventsByLecture(s: Store): Map<string, LectureEvent[]> {
  return s.memo('eventsByLecture', [s.collectionVersion('lectureEvents')], () => {
    const map = new Map<string, LectureEvent[]>();
    for (const e of s.all('lectureEvents')) map.set(e.lectureId, [...(map.get(e.lectureId) ?? []), e]);
    return map;
  });
}

/** Lecture state of a lecture (memoised per events version). */
export function selectLectureState(s: Store, lectureId: string): LectureState {
  return s.memo(`lectureState:${lectureId}`, [s.collectionVersion('lectureEvents')], () =>
    buildLectureState(eventsByLecture(s).get(lectureId) ?? []),
  );
}

/** Subscribes to a lecture's state. */
export function useLectureState(lectureId: string | null): LectureState | null {
  return useSelector((s) => (lectureId ? selectLectureState(s, lectureId) : null));
}

/** All lectures, newest first. */
export function useLectures(): Lecture[] {
  return useSelector((s) => s.memo('lecturesSorted', [s.collectionVersion('lectures')], () => [...s.all('lectures')].sort((a, b) => b.createdAt - a.createdAt)));
}

/** The lecture currently recording or paused (if any). */
export function useActiveLecture(): Lecture | null {
  return useSelector((s) =>
    s.memo('activeLecture', [s.collectionVersion('lectures'), s.collectionVersion('lectureEvents')], () => {
      for (const l of [...s.all('lectures')].sort((a, b) => b.createdAt - a.createdAt)) {
        const st = selectLectureState(s, l.id);
        if (isRunning(st) || st.pausedSince !== null) return l;
      }
      return null;
    }),
  );
}

/** Lecture-mode settings with defaults. */
export function useLectureSettings(): LectureSettings {
  return useSelector((s) => s.memo('lectureSettings', [s.collectionVersion('settings')], () => ({ ...DEFAULT_LECTURE_SETTINGS, ...selectSettings(s).lecture })));
}

/**
 * Measures time outside the app while a lecture is recording: the tab is
 * hidden or the window lost focus. Stretches shorter than
 * `awayMinSeconds` are ignored. Returns the last long absence for the
 * "welcome back" banner.
 */
export function useAwayTracking(lectureId: string | null, running: boolean, slide: number | null, cfg: LectureSettings): { since: number; ms: number; slide: number | null } | null {
  const app = useApp();
  const awayStart = useRef<number | null>(null);
  const slideRef = useRef(slide);
  slideRef.current = slide;
  const [welcome, setWelcome] = useState<{ since: number; ms: number; slide: number | null } | null>(null);
  useEffect(() => {
    if (!lectureId || !running || !cfg.trackAway) return;
    const leave = (): void => {
      if (awayStart.current === null) awayStart.current = Date.now();
    };
    const back = (): void => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      const start = awayStart.current;
      awayStart.current = null;
      if (start === null) return;
      const end = Date.now();
      if (end - start < cfg.awayMinSeconds * 1000) return;
      app.lectures.record(lectureId, 'away', { start, end, ...(slideRef.current !== null ? { slide: slideRef.current } : {}) });
      if (end - start >= cfg.welcomeBackSeconds * 1000) setWelcome({ since: start, ms: end - start, slide: slideRef.current });
    };
    const onVisibility = (): void => (document.visibilityState === 'hidden' ? leave() : back());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', back);
    return () => {
      back();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', back);
    };
  }, [app, lectureId, running, cfg.trackAway, cfg.awayMinSeconds, cfg.welcomeBackSeconds]);
  return welcome && Date.now() - welcome.since < 10 * 60_000 ? welcome : null;
}

/**
 * Prompts a recall check-in every `checkinMinutes` of lecture time while the
 * app is visible.
 */
export function useCheckinTimer(lectureId: string | null, state: LectureState | null, cfg: LectureSettings): void {
  const app = useApp();
  useEffect(() => {
    if (!lectureId || !state) return;
    const tick = (): void => {
      const due = nextCheckinIn(state, Date.now(), cfg.checkinMinutes);
      if (due === 0 && document.visibilityState === 'visible') {
        app.lectures.record(lectureId, 'checkin_prompt', { text: nextCheckinPrompt(state), ...(currentSlide(state) !== null ? { slide: currentSlide(state)! } : {}) });
      }
    };
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [app, lectureId, state, cfg.checkinMinutes]);
}

/** Formats milliseconds as `h:mm:ss` / `m:ss`. */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
