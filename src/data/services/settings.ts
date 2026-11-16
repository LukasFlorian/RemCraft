/**
 * Application service for settings and scheduler configurations.
 */
import { createSchedulerConfig, DEFAULT_SCHEDULER_ID } from '@core/model/factories';
import type { SchedulerConfig, Settings } from '@core/model/types';
import { selectSettings } from '../selectors';
import type { Store } from '../store/store';

/** Settings and schedulers. */
export class SettingsService {
  constructor(private readonly store: Store) {}

  /** Current settings. */
  get(): Settings {
    return selectSettings(this.store);
  }

  /** Updates settings. */
  update(patch: Partial<Settings>): void {
    this.store.transact((tx) => void tx.put('settings', { ...this.get(), ...patch }));
  }

  /** Creates a custom scheduler. */
  createScheduler(partial: Partial<SchedulerConfig> = {}): SchedulerConfig {
    return this.store.transact((tx) =>
      tx.put('schedulers', createSchedulerConfig(partial, this.store.clock.now())),
    );
  }

  /** Updates (or creates) a scheduler configuration. */
  saveScheduler(config: SchedulerConfig): void {
    this.store.transact((tx) => void tx.put('schedulers', config));
  }

  /**
   * Deletes a custom scheduler. Rems assigned to it fall back to the default.
   *
   * @returns False for the built-in default scheduler.
   */
  deleteScheduler(id: string): boolean {
    if (id === DEFAULT_SCHEDULER_ID) return false;
    this.store.transact((tx) => {
      tx.delete('schedulers', id);
      for (const rem of this.store.all('rems'))
        if (rem.schedulerId === id) tx.update('rems', rem.id, { schedulerId: undefined });
      const settings = this.get();
      if (settings.defaultSchedulerId === id)
        tx.put('settings', { ...settings, defaultSchedulerId: DEFAULT_SCHEDULER_ID });
    });
    return true;
  }
}
