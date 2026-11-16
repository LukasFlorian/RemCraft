/**
 * Domain model of RemCraft.
 *
 * Everything the user writes is a **Rem** (a bullet in the outliner). Documents
 * and folders are Rems with a flag, flashcards are *derived* from Rems, and
 * the scheduling state of every flashcard lives in a separate {@link CardState}
 * record keyed by a deterministic {@link CardId}. This separation keeps editing
 * and reviewing independent: editing a Rem never destroys learning progress.
 *
 * All records are plain JSON-serialisable objects so that they can be stored
 * in IndexedDB and synchronised to Supabase without mapping layers.
 */

/** Unique identifier of a Rem. */
export type RemId = string;

/** Identifier of a flashcard: `${remId}/${slot}` (see `cards/generate.ts`). */
export type CardId = string;

/** Milliseconds since the Unix epoch. */
export type Timestamp = number;

/** Highlight colours supported for text and blocks (same palette as RemNote). */
export const HIGHLIGHT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;

/** One of the {@link HIGHLIGHT_COLORS}. */
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

// ---------------------------------------------------------------------------
// Rich text
// ---------------------------------------------------------------------------

/** Inline formatting that can be applied to any rich-text segment. */
export interface TextMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Inline code (monospace). */
  code?: boolean;
  /** Background highlight colour. */
  highlight?: HighlightColor;
  /**
   * Cloze id. Segments sharing the same id form a single cloze deletion; two
   * clozes are "merged" (one card hides both) when they share an id.
   */
  cloze?: string;
  /** Hyperlink target. */
  link?: string;
}

/** Plain text run. */
export interface TextSegment {
  type: 'text';
  text: string;
  marks?: TextMarks;
}

/** Inline reference to another Rem; rendered with that Rem's current text. */
export interface RefSegment {
  type: 'ref';
  remId: RemId;
  marks?: TextMarks;
}

/** Inline LaTeX formula rendered with KaTeX. */
export interface LatexSegment {
  type: 'latex';
  source: string;
  marks?: TextMarks;
}

/** A single inline element of a {@link RichText}. */
export type Segment = TextSegment | RefSegment | LatexSegment;

/** Rich text is an ordered list of inline segments. */
export type RichText = Segment[];

// ---------------------------------------------------------------------------
// Rems
// ---------------------------------------------------------------------------

/**
 * Semantic kind of a Rem. Concepts (`::`) are rendered bold and practiced in
 * both directions by default, descriptors (`;;`) describe an attribute of
 * their parent concept and are rendered italic.
 */
export type RemKind = 'plain' | 'concept' | 'descriptor';

/** Which flashcards the separator of a Rem generates. */
export type CardDirection = 'none' | 'forward' | 'backward' | 'both' | 'disabled';

/**
 * Where the answer of a card comes from:
 * - `inline`: the back text after the separator,
 * - `set`: all children revealed at once (multi-line card),
 * - `list`: children revealed one by one in order (list-answer card),
 * - `mc`: children are answer options (multiple choice).
 */
export type AnswerMode = 'inline' | 'set' | 'list' | 'mc';

/**
 * Practice priority of a subtree, inherited by descendants. The fifth
 * priority, *exam*, is derived from {@link Exam} scopes and never stored.
 */
export type Priority = 'active' | 'maintaining' | 'none' | 'paused';

/** Effective priority including the derived exam priority. */
export type EffectivePriority = Priority | 'exam';

/** State of a todo item. */
export type TodoStatus = 'unfinished' | 'finished';

/** A rectangular mask on an image, used by image-occlusion cards. */
export interface Occlusion {
  /** Stable id; part of the generated card id. */
  id: string;
  /** Left edge relative to the image width (0..1). */
  x: number;
  /** Top edge relative to the image height (0..1). */
  y: number;
  /** Width relative to the image width (0..1). */
  w: number;
  /** Height relative to the image height (0..1). */
  h: number;
  /** Optional label shown on the mask while answering. */
  label?: string;
}

/** Image attached to a Rem. */
export interface RemImage {
  /** URL, data URL or `file:<id>` reference into the file store. */
  src: string;
  /** Display width in CSS pixels (undefined = natural width, capped). */
  width?: number;
  /** Image-occlusion masks; each one generates a card. */
  occlusions?: Occlusion[];
  /** Hide all masks while asking (true) or only the asked one (false). */
  hideAllOcclusions?: boolean;
}

/** Uploaded file (e.g. a PDF) attached to a document Rem. */
export interface RemFile {
  /** `file:<id>` reference into the file store or an external URL. */
  src: string;
  name: string;
  mimeType: string;
  size: number;
}

/** Markers of a slide (Fokus): important ★ and unclear ?. */
export type SlideFlag = 'important' | 'unclear';

/**
 * Slide-deck information on a document Rem.
 * `boxes` are slide rectangles in relative page coordinates `[x0, y0, x1, y1]`
 * (several per page for handouts); every slide Rem references a page and box.
 */
export interface DeckInfo {
  /** `file:<id>` of the PDF. */
  src: string;
  /** Original file name (matched against `source.pdf` of card files). */
  pdfName: string;
  pdfPages: number;
  /** Layout mode: `auto` or `RxC` (rows × columns). */
  layout: string;
  boxes: number[][];
}

/** Position of a slide inside its deck. */
export interface SlideInfo {
  /** 0-based slide index (order of the slides). */
  index: number;
  /** 0-based PDF page. */
  page: number;
  /** Index into `DeckInfo.boxes`. */
  box: number;
}

/** Where an imported card or explanation came from. */
export interface FokusOrigin {
  /** Name of the imported file. */
  file: string;
  /** Content key (section + front + back) used to keep progress on re-import. */
  key: string;
  pages?: number[];
  anchor?: string;
  /** Explanation of a slide (`notes[]` of the file) rather than a card. */
  explanation?: boolean;
}

/**
 * A Rem: the universal building block of the knowledge base.
 *
 * Optional fields are omitted when unset so that stored records stay small.
 */
export interface Rem {
  id: RemId;
  /** Parent Rem; `null` for top-level Rems (shown in the sidebar). */
  parentId: RemId | null;
  /** Fractional index that orders siblings (see `model/ordering.ts`). */
  order: string;
  /** Front text (everything before the card separator). */
  text: RichText;
  /** Back text after the separator; `null` when the Rem has no separator. */
  back: RichText | null;
  kind: RemKind;
  direction: CardDirection;
  answerMode: AnswerMode;
  /** Documents open as pages and appear in "Documents & Folders". */
  isDocument: boolean;
  /** Folders group documents and other folders. */
  isFolder: boolean;
  /** Tags (references to tag Rems). */
  tags: RemId[];
  /** Alternative names used by search and reference autocompletion. */
  aliases: string[];

  // --- presentation "powerups" ------------------------------------------
  heading?: 1 | 2 | 3;
  todo?: TodoStatus;
  quote?: boolean;
  /** Code block; the text is treated as source code. */
  code?: { language: string };
  /** Display-mode LaTeX block; the text is the LaTeX source. */
  latexBlock?: boolean;
  divider?: boolean;
  /** Block background highlight. */
  highlight?: HighlightColor;
  image?: RemImage;
  file?: RemFile;
  /** Embedded media (audio, video, web page). */
  embed?: { url: string };
  /** Children are hidden in the outliner. */
  collapsed?: boolean;
  /** Portal: renders (and edits) the target Rem in place. */
  portalOf?: RemId;
  /** Search portal: renders all Rems matching the query. */
  searchQuery?: string;
  /** Render the Rems tagged with this Rem as a table with property columns. */
  tableView?: boolean;
  /** This Rem is a property (column) of its parent tag Rem. */
  isProperty?: boolean;
  /** This Rem stores the value of the given property for its parent. */
  propertyId?: RemId;

  // --- flashcard configuration ----------------------------------------
  /** For children of a multiple-choice Rem: whether this option is correct. */
  mcCorrect?: boolean;
  /** Shown on the back of the parent's cards instead of being practiced. */
  extraCardDetail?: boolean;
  /** Cards of this subtree are answered by typing (inherited). */
  typeInAnswer?: boolean;
  /** Practice priority of this subtree (inherited). */
  priority?: Priority;
  /** Scheduler used for cards of this subtree (inherited). */
  schedulerId?: string;
  /** Optional hints per cloze id, shown instead of "[…]". */
  clozeHints?: Record<string, string>;
  /** Hide the ancestor breadcrumb while practicing cards of this subtree. */
  hideContextInQueue?: boolean;

  // --- organisation -----------------------------------------------------
  pinned?: boolean;
  editLater?: boolean;
  isTemplate?: boolean;
  /** ISO date (YYYY-MM-DD) for daily documents. */
  dailyDate?: string;

  // --- lectures (slides ↔ notes ↔ flashcards) -----------------------------
  /** This document is a slide deck (its children are the slides). */
  deck?: DeckInfo;
  /** This Rem is one slide of its parent deck; its children are the notes of the slide. */
  slide?: SlideInfo;
  /** Text extracted from the slide (search, card anchors, assistant context). */
  slideText?: string;
  /** Markers set during the lecture. */
  slideFlags?: SlideFlag[];
  /** Origin of Rems imported from a `*.fokus.json` file (keeps progress on re-import). */
  fokus?: FokusOrigin;

  // --- sharing -----------------------------------------------------------------
  /** Shared space the Rem is synchronised in (absent = the owner's personal space). */
  spaceId?: string;
  /**
   * Set on the root of a shared subtree (value = its space id). Descendants
   * inherit `spaceId` from their parent; only roots carry this marker.
   */
  spaceRoot?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Flashcards & scheduling
// ---------------------------------------------------------------------------

/** Kind of a generated flashcard. */
export type CardKind = 'forward' | 'backward' | 'cloze' | 'occlusion';

/**
 * Self-assessment after answering a card. RemNote's labels:
 * 1 = Forgot, 2 = Partially recalled, 3 = Recalled with effort,
 * 4 = Easily recalled.
 */
export type Rating = 1 | 2 | 3 | 4;

/** Learning phase of a card. */
export type CardPhase = 'new' | 'learning' | 'review' | 'relearning';

/**
 * Persistent scheduling state of one flashcard.
 *
 * The record holds the union of the fields used by all supported algorithms
 * (SM-2: `interval`/`ease`; FSRS: `stability`/`difficulty`) so a card can be
 * moved to another scheduler without losing its history.
 */
export interface CardState {
  id: CardId;
  remId: RemId;
  phase: CardPhase;
  /** When the card is next due; `0` for cards that were never practiced. */
  due: Timestamp;
  lastReview: Timestamp | null;
  /** Current interval in days. */
  interval: number;
  /** SM-2 ease factor (e.g. 2.3 = 230 %). */
  ease: number;
  /** FSRS memory stability in days. */
  stability: number;
  /** FSRS difficulty (1..10). */
  difficulty: number;
  /** Index into the (re)learning steps. */
  step: number;
  /** Number of reviews. */
  reps: number;
  /** Number of times the card was forgotten after graduating. */
  lapses: number;
  /** Consecutive successful recalls (used by the exam scheduler). */
  streak: number;
  /** Card explicitly disabled by the user. */
  disabled?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** How a review was performed. */
export type PracticeMode = 'srs' | 'exam' | 'all' | 'all-in-order' | 'cram';

/** Immutable log entry of a single review. */
export interface ReviewLog {
  id: string;
  cardId: CardId;
  remId: RemId;
  rating: Rating;
  reviewedAt: Timestamp;
  /** Time spent on the card in milliseconds. */
  durationMs: number;
  mode: PracticeMode;
  /** Algorithm that produced the new state. */
  algorithm: SchedulerAlgorithm;
  /** State before the review (enables undo and FSRS optimisation). */
  before: CardState;
  /** Interval (days) and due date after the review. */
  intervalAfter: number;
  dueAfter: Timestamp;
  /** Exam the review counted towards, if any. */
  examId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Scheduling algorithm id. Built in: `sm2`, `fsrs`, `exponential`; further
 * algorithms can be registered at runtime (see `scheduling/registry.ts`).
 */
export type SchedulerAlgorithm = 'sm2' | 'fsrs' | 'exponential' | (string & {});

/** Parameters of RemNote's Anki-SM-2 variant (see docs/scheduling.md). */
export interface Sm2Params {
  /** Learning steps for new cards, in minutes. */
  learningSteps: number[];
  /** Relearning steps after a lapse, in minutes. */
  relearningSteps: number[];
  /** Interval in days when graduating with "Recalled with effort". */
  graduatingInterval: number;
  /** Interval in days when graduating with "Easily recalled". */
  easyInterval: number;
  /** Initial ease factor (2.3 = 230 %). */
  startingEase: number;
  /** Lower bound of the ease factor. */
  minimumEase: number;
  /** Extra multiplier applied on "Easily recalled". */
  easyBonus: number;
  /** Multiplier applied on "Partially recalled". */
  hardInterval: number;
  /** Global multiplier on every review interval. */
  intervalModifier: number;
  /** New interval after a lapse = old interval × this multiplier. */
  lapseMultiplier: number;
  /** Minimum interval in days after a lapse. */
  minimumLapseInterval: number;
  /** Upper bound of intervals, in days. */
  maximumInterval: number;
  /** Randomise review intervals slightly to avoid clumping. */
  fuzz: boolean;
  /** Share of the overdue days added before multiplying on "Partially recalled" (default 0.25). */
  overdueBonusHard?: number;
  /** … on "Recalled with effort" (default 0.5). */
  overdueBonusGood?: number;
  /** … on "Easily recalled" (default 1). */
  overdueBonusEasy?: number;
}

/** Parameters of the FSRS-6 algorithm. */
export interface FsrsParams {
  /** The 21 FSRS-6 model weights. */
  weights: number[];
  /** Target probability of recall when a card becomes due (0.7..0.99). */
  desiredRetention: number;
  /** Short-term learning steps in minutes (empty = none). */
  learningSteps: number[];
  /** Relearning steps in minutes. */
  relearningSteps: number[];
  /** Minutes until a never-seen card answered "Forgot" returns (used without learning steps). */
  newCardForgotInterval?: number;
  /** Upper bound of intervals, in days. */
  maximumInterval: number;
  fuzz: boolean;
}

/** A named scheduler configuration that can be assigned to subtrees. */
export interface SchedulerConfig {
  id: string;
  name: string;
  algorithm: SchedulerAlgorithm;
  sm2: Sm2Params;
  fsrs: FsrsParams;
  /** Parameters of registered (plugin) algorithms, keyed by algorithm id. */
  extra?: Record<string, Record<string, unknown>>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

/** What to do with cards that were never practiced when an exam is created. */
export type NewCardMode = 'spread' | 'due-now';

/** An exam that drives the exam scheduler for a set of documents/folders. */
export interface Exam {
  id: string;
  name: string;
  /** Start of the exam. */
  date: Timestamp;
  /** Folders, documents or Rems whose cards are part of the exam. */
  scope: RemId[];
  newCardMode: NewCardMode;
  /** Add one last review of every card shortly before the exam. */
  finalReview: boolean;
  /** Length of the final-review window in days. */
  finalReviewDays: number;
  /** Missed cards need two consecutive successful recalls. */
  extraPractice: boolean;
  archived?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Which priorities count towards the daily goal. */
export type DailyGoalMode = 'exam-and-active' | 'all-due' | 'custom-number';

/** User preferences (synchronised across devices). */
export interface Settings {
  id: 'settings';
  defaultSchedulerId: string;
  dailyGoalMode: DailyGoalMode;
  /** Used when `dailyGoalMode` is `custom-number`. */
  dailyGoalNumber: number;
  /** Cards that must be practiced per day to keep the streak. */
  streakGoal: number;
  /** Maximum new cards introduced per day outside exams. */
  newCardsPerDay: number;
  /** Hour at which a new study day starts (0..23). */
  dayStartHour: number;
  theme: 'dark' | 'light' | 'system';
  /** Grading of typed answers. */
  typeInAnswerGrading: 'exact' | 'lenient';
  /** Shuffle the global queue instead of ordering by due date. */
  shuffleQueue: boolean;
  /** Learning cards may be shown this many minutes early at the end of the queue (RemNote: 15). */
  learnAheadMinutes?: number;
  /** Lecture mode (Fokus) options; defaults apply when absent. */
  lecture?: Partial<LectureSettings>;
  /**
   * Ids of imported objects from other apps (`<source>:<kind>:<id>` -> Rem id),
   * so re-importing (e.g. Fokus data, later Anki) updates instead of duplicating.
   */
  externalIds?: Record<string, string>;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Lectures (attention tracking, ported from Fokus)
// ---------------------------------------------------------------------------

/** A pen/marker stroke on a slide; points relative to the slide (x0, y0, x1, y1, …). */
export interface Stroke {
  tool: 'pen' | 'marker';
  color: string;
  /** Width relative to the slide width. */
  width: number;
  p: number[];
}

/** A text box placed on a slide (positions/sizes relative to the slide). */
export interface TextBox {
  id: string;
  x: number;
  y: number;
  w: number;
  /** Font size relative to the slide width. */
  s: number;
  /** Text colour. */
  c: string;
  bg: 'note' | 'white' | 'none';
  text: string;
}

/** A highlight of slide text; one rectangle per marked line. */
export interface TextMark {
  id: string;
  c: string;
  text: string;
  rects: [number, number, number, number][];
}

/** Drawings, text boxes and highlights of one slide (id = slide Rem id). */
export interface SlideAnnotations {
  id: RemId;
  /** Space of the slide (annotations are shared together with the slide). */
  spaceId?: string;
  strokes: Stroke[];
  boxes: TextBox[];
  marks: TextMark[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** One lecture (recording). Its history lives in {@link LectureEvent}s. */
export interface Lecture {
  id: string;
  name: string;
  /** Slide deck shown in the lecture. */
  deckId: RemId | null;
  /** Course folder. */
  courseId: RemId | null;
  archived?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Lecture event types (event sourcing, like Fokus):
 * `start`/`stop` (recording intervals; `pause` marks a break), `slide`
 * (navigation), `goal`, `summary`, `away` (time outside the app), `drift`
 * (self-caught mind wandering), `checkin_prompt`/`checkin` (recall
 * questions), `focus` (settings in effect), `flag`, `note`.
 */
export type LectureEventType =
  | 'start'
  | 'stop'
  | 'slide'
  | 'goal'
  | 'summary'
  | 'away'
  | 'drift'
  | 'checkin_prompt'
  | 'checkin'
  | 'focus'
  | 'flag'
  | 'note';

/** One immutable lecture event (own record so devices never overwrite each other). */
export interface LectureEvent {
  id: string;
  lectureId: string;
  type: LectureEventType;
  /** Wall-clock time (ms). */
  t: Timestamp;
  /** Slide index the event refers to. */
  slide?: number;
  /** `away`: start/end (ms). */
  start?: Timestamp;
  end?: Timestamp;
  /** Free text (goal, summary, check-in prompt/answer). */
  text?: string;
  /** `checkin`: id of the prompt event. */
  ref?: string;
  /** `checkin`: self-rated focus 1-5. */
  focus?: number;
  skipped?: boolean;
  /** `stop`: break instead of end. */
  pause?: boolean;
  /** `flag`: marker kind and state. */
  flag?: SlideFlag;
  on?: boolean;
  /** `focus`: away tracking active. */
  trackAway?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Thresholds and options of lecture mode (Fokus). */
export interface LectureSettings {
  /** Recall check-in every N lecture minutes (0 = off). */
  checkinMinutes: number;
  /** Record time outside the app. */
  trackAway: boolean;
  /** Shorter switches are ignored (s). */
  awayMinSeconds: number;
  /** After this long away a "welcome back" banner appears (s). */
  welcomeBackSeconds: number;
  /** Shorter visits count as "skipped" (s). */
  minDwellSeconds: number;
  /** This long outside the app on a slide → review (s). */
  missedMinSeconds: number;
  /** … or this share of the slide's time. */
  missedRatio: number;
  /** Explained this long (and ≥ 1.5 × median) without a note → review (s). */
  longDwellSeconds: number;
}

/** Names of all synchronised collections. */
export type CollectionName =
  | 'rems'
  | 'cards'
  | 'logs'
  | 'exams'
  | 'schedulers'
  | 'settings'
  | 'annotations'
  | 'lectures'
  | 'lectureEvents';

/** Maps every collection name to its record type. */
export interface CollectionTypes {
  rems: Rem;
  cards: CardState;
  logs: ReviewLog;
  exams: Exam;
  schedulers: SchedulerConfig;
  settings: Settings;
  annotations: SlideAnnotations;
  lectures: Lecture;
  lectureEvents: LectureEvent;
}
