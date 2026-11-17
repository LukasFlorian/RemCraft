/**
 * Registry of spaced-repetition algorithms.
 *
 * Built in: RemNote's Anki-SM-2 variant, FSRS-6 and the legacy exponential
 * scheduler. To add another algorithm (e.g. Anki's "FSRS with presets",
 * SuperMemo SM-18, Leitner boxes) implement {@link Scheduler} and call
 * `SCHEDULERS.register({...})`; its parameters live in
 * `SchedulerConfig.extra[<id>]`. Settings, queues, exams and statistics work
 * with it unchanged.
 */
import type { SchedulerConfig } from '../model/types';
import { Registry } from '../util/registry';
import type { Registrable } from '../util/registry';
import type { Scheduler } from './common';
import { createExponentialScheduler } from './exponential';
import { createFsrsScheduler } from './fsrs';
import { createSm2Scheduler } from './sm2';

/** A scheduling algorithm plugin. */
export interface SchedulerPlugin extends Registrable {
  /** One-sentence explanation for the settings page. */
  description: string;
  /** Builds a scheduler from a stored configuration. */
  create(config: SchedulerConfig): Scheduler;
}

/** All available algorithms. */
export const SCHEDULERS = new Registry<SchedulerPlugin>('scheduler');

SCHEDULERS.register({
  id: 'sm2',
  label: 'Anki SM-2',
  description: "RemNote's default: learning steps, then intervals multiplied by a per-card ease.",
  create: (c) => createSm2Scheduler(c.sm2),
});
SCHEDULERS.register({
  id: 'fsrs',
  label: 'FSRS-6',
  description:
    'Memory model (stability, difficulty) that targets a desired retention; ~20-30 % fewer reviews.',
  create: (c) => createFsrsScheduler(c.fsrs),
});
SCHEDULERS.register({
  id: 'exponential',
  label: 'Exponential (legacy)',
  description: "RemNote's early fixed exponential intervals; not recommended for new cards.",
  create: () => createExponentialScheduler(),
});
