import { RemCraftApp } from '../app';
import { MemoryAdapter } from '../persistence/memory';
import { FakeServer } from '../testing/fakeRemote';
import { defaultHabit, selectHabitData, selectHabits } from './habits';
import { isDone, streaks } from '@core/habits/habits';

/** A signed-in device on the fake server. */
async function device(server: FakeServer): Promise<RemCraftApp> {
  const app = await RemCraftApp.create({
    persistence: new MemoryAdapter(),
    backend: null,
    seed: false,
    remoteFactory: () => server.client(),
  });
  await app.handleUser({ id: 'user-1', email: null });
  await app.syncNow();
  return app;
}

describe('HabitService', () => {
  it('creates, orders, records days with notes and syncs them', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const today = '2026-11-19';
    const sport = a.habits.create({ ...defaultHabit('2026-11-01'), name: 'Sport' });
    const water = a.habits.create({
      ...defaultHabit('2026-11-01'),
      name: 'Wasser',
      tracking: 'count',
      target: 3,
    });
    a.habits.move(water.id, sport.id);
    expect(selectHabits(a.store).map((h) => h.name)).toEqual(['Wasser', 'Sport']);

    a.habits.setValue(sport.id, '2026-11-18', 1);
    a.habits.setValue(sport.id, today, 1);
    a.habits.setNote(sport.id, today, 'Laufen im Regen');
    a.habits.setValue(water.id, today, 2);
    let d = selectHabitData(a.store, a.store.getRecord('habits', sport.id)!, today);
    expect(streaks(d).current).toBe(2);

    // Clearing the value keeps the note; clearing both removes the entry.
    a.habits.setValue(sport.id, today, 0);
    expect(a.habits.entry(sport.id, today)?.note).toBe('Laufen im Regen');
    a.habits.setNote(sport.id, today, '');
    expect(a.habits.entry(sport.id, today)).toBeUndefined();

    // Another device sees habits and days.
    a.habits.setValue(sport.id, today, 1);
    await a.flush();
    await a.syncNow();
    const b = await device(server);
    d = selectHabitData(b.store, b.store.getRecord('habits', sport.id)!, today);
    expect(isDone(d, today)).toBe(true);
    expect(b.habits.entry(water.id, today)?.value).toBe(2);
    expect(b.habits.exportCsv(today)).toContain('2026-11-19;"Sport";1;1;""');

    // Deleting removes the entries too.
    b.habits.delete(sport.id);
    expect(b.store.all('habitEntries').some((e) => e.habitId === sport.id)).toBe(false);
    a.dispose();
    b.dispose();
  });
});
