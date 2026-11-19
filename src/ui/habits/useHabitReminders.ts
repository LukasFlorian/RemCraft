/**
 * Habit reminders and the "open today" count.
 *
 * Reminders are local notifications: while the app is open (also as an
 * installed app in the background, as long as the system keeps it alive),
 * every reminder whose time has come shows a notification once per day -
 * only when the habit is not done yet. There is no push server, so a closed
 * app cannot remind.
 */
import { useEffect, useRef } from 'react';
import { dayKey } from '@core/habits/days';
import { dueReminders, isDone } from '@core/habits/habits';
import { selectHabitData, selectHabits } from '@data/services/habits';
import { useSelector, useStore } from '../app/context';
import { feature } from '../app/channel';
import { useToday } from './common';

/** localStorage key of reminders already shown (`<reminder>:<day>`). */
const SHOWN_KEY = 'remcraft.habitReminders.shown';

/** Reads the shown reminders of the last days. */
function readShown(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Stores the shown reminders (only today's are kept). */
function writeShown(shown: Set<string>, today: string): void {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown].filter((k) => k.endsWith(today))));
  } catch {
    // Private mode: reminders may repeat after a reload.
  }
}

/**
 * Shows a notification (through the service worker when available, so it
 * also works for installed apps).
 */
async function notify(title: string, body: string, url: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  const options: NotificationOptions = {
    body,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    tag: url,
    data: { url },
  };
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}

/** Checks reminders every 30 seconds while the app runs. */
export function useHabitReminders(): void {
  const store = useStore();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!feature('habits')) return;
    const check = (): void => {
      const now = new Date();
      const today = dayKey(now);
      const shown = readShown();
      for (const habit of selectHabits(store)) {
        if (habit.reminders.length === 0) continue;
        const data = selectHabitData(store, habit, today);
        for (const key of dueReminders(data, now, shown)) {
          shown.add(key);
          void notify(
            habit.name,
            habit.description || 'Zeit für deine Gewohnheit – heute noch offen.',
            `#/habits/${habit.id}`,
          );
        }
      }
      writeShown(shown, today);
    };
    check();
    timer.current = setInterval(check, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [store]);
}

/** Number of active habits not done today (0 when the feature is off). */
export function useHabitsOpenToday(): number {
  const today = useToday();
  return useSelector((s) =>
    feature('habits')
      ? selectHabits(s).filter(
          (h) => h.kind === 'build' && !isDone(selectHabitData(s, h, today), today),
        ).length
      : 0,
  );
}
