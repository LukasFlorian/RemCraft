/**
 * Factory functions and default values for all domain records.
 *
 * Keeping defaults in one place guarantees that new records are always
 * complete and that documentation (docs/scheduling.md) has a single source.
 */
import { newId } from '../util/ids';
import type {
  CardId,
  CardState,
  Exam,
  FsrsParams,
  Rem,
  RemId,
  SchedulerConfig,
  Settings,
  Sm2Params,
  Timestamp,
} from './types';

/**
 * Default parameters of RemNote's Anki-SM-2 variant.
 *
 * Values follow RemNote's help center where documented (starting ease 230 %,
 * easy bonus 1.3, hard factor 1.2, lapse multiplier 0.1) and Anki's defaults
 * otherwise.
 */
export const DEFAULT_SM2_PARAMS: Readonly<Sm2Params> = Object.freeze({
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.3,
  minimumEase: 1.3,
  easyBonus: 1.3,
  hardInterval: 1.2,
  intervalModifier: 1,
  lapseMultiplier: 0.1,
  minimumLapseInterval: 1,
  maximumInterval: 36500,
  fuzz: true,
});

/** Default FSRS-6 model weights (identical to the reference implementation). */
export const DEFAULT_FSRS_WEIGHTS: readonly number[] = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

/** Default FSRS parameters. */
export const DEFAULT_FSRS_PARAMS: Readonly<FsrsParams> = Object.freeze({
  weights: [...DEFAULT_FSRS_WEIGHTS],
  desiredRetention: 0.9,
  learningSteps: [1, 10],
  relearningSteps: [10],
  maximumInterval: 36500,
  fuzz: true,
});

/** Id of the built-in default scheduler. */
export const DEFAULT_SCHEDULER_ID = 'default';

/**
 * Creates a scheduler configuration.
 *
 * @param partial Fields overriding the defaults.
 * @param now Creation time.
 */
export function createSchedulerConfig(
  partial: Partial<SchedulerConfig> = {},
  now: Timestamp = Date.now(),
): SchedulerConfig {
  return {
    id: partial.id ?? newId(),
    name: partial.name ?? 'Custom scheduler',
    algorithm: partial.algorithm ?? 'sm2',
    sm2: { ...DEFAULT_SM2_PARAMS, ...partial.sm2 },
    fsrs: { ...DEFAULT_FSRS_PARAMS, weights: [...DEFAULT_FSRS_WEIGHTS], ...partial.fsrs },
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/** The built-in global default scheduler (Anki SM-2, like RemNote). */
export function createDefaultScheduler(now: Timestamp = Date.now()): SchedulerConfig {
  return createSchedulerConfig({ id: DEFAULT_SCHEDULER_ID, name: 'Default (Anki SM-2)' }, now);
}

/** Default user settings. */
export function createDefaultSettings(now: Timestamp = Date.now()): Settings {
  return {
    id: 'settings',
    defaultSchedulerId: DEFAULT_SCHEDULER_ID,
    dailyGoalMode: 'exam-and-active',
    dailyGoalNumber: 50,
    streakGoal: 10,
    newCardsPerDay: 20,
    dayStartHour: 4,
    theme: 'dark',
    typeInAnswerGrading: 'lenient',
    shuffleQueue: false,
    updatedAt: now,
  };
}

/**
 * Creates a new Rem with sensible defaults.
 *
 * @param partial Fields to set; `id`, timestamps and text get defaults.
 * @param now Creation time.
 */
export function createRem(partial: Partial<Rem> = {}, now: Timestamp = Date.now()): Rem {
  return {
    id: partial.id ?? newId(),
    parentId: partial.parentId ?? null,
    order: partial.order ?? 'a0',
    text: partial.text ?? [],
    back: partial.back ?? null,
    kind: partial.kind ?? 'plain',
    direction: partial.direction ?? 'none',
    answerMode: partial.answerMode ?? 'inline',
    isDocument: partial.isDocument ?? false,
    isFolder: partial.isFolder ?? false,
    tags: partial.tags ?? [],
    aliases: partial.aliases ?? [],
    ...stripCore(partial),
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

/** Removes the core fields handled explicitly by {@link createRem}. */
function stripCore(partial: Partial<Rem>): Partial<Rem> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, parentId, order, text, back, kind, direction, answerMode, isDocument, isFolder, tags, aliases, createdAt, updatedAt, ...rest } =
    partial;
  return rest;
}

/**
 * Creates the initial (never practiced) state of a card.
 *
 * @param id Card id.
 * @param remId Rem the card belongs to.
 * @param now Creation time.
 */
export function createCardState(id: CardId, remId: RemId, now: Timestamp = Date.now()): CardState {
  return {
    id,
    remId,
    phase: 'new',
    due: 0,
    lastReview: null,
    interval: 0,
    ease: DEFAULT_SM2_PARAMS.startingEase,
    stability: 0,
    difficulty: 0,
    step: 0,
    reps: 0,
    lapses: 0,
    streak: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates an exam with RemNote's recommended defaults.
 *
 * @param partial Fields overriding the defaults (name, date and scope are expected).
 * @param now Creation time.
 */
export function createExam(partial: Partial<Exam> = {}, now: Timestamp = Date.now()): Exam {
  return {
    id: partial.id ?? newId(),
    name: partial.name ?? 'Exam',
    date: partial.date ?? now + 14 * 24 * 3600 * 1000,
    scope: partial.scope ?? [],
    newCardMode: partial.newCardMode ?? 'spread',
    finalReview: partial.finalReview ?? true,
    finalReviewDays: partial.finalReviewDays ?? 2,
    extraPractice: partial.extraPractice ?? true,
    ...(partial.archived !== undefined ? { archived: partial.archived } : {}),
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}
