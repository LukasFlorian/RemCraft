/**
 * Initial content for a fresh installation: settings, the default scheduler
 * and a "Getting Started" document that demonstrates every card type.
 *
 * Seed records use deterministic ids so that two devices which both start
 * offline end up with the same records instead of duplicates after syncing.
 */
import { importMarkdown } from '@core/io/markdown';
import { createDefaultScheduler, createDefaultSettings, createRem } from '@core/model/factories';
import type { Rem, RemId } from '@core/model/types';
import { rt } from '@core/richtext/ops';
import type { Store } from './store/store';

/** Id of the welcome document. */
export const WELCOME_DOC_ID = 'seed-welcome';

/** Getting-started content in RemNote/RemCraft text syntax. */
const WELCOME_MARKDOWN = `- # Writing notes
    - Every bullet is a **Rem**. Press Enter for a new Rem, Tab / Shift+Tab to indent and outdent.
    - Type \`/\` for the command menu, \`[[\` for a reference, \`#\` for a tag and \`((\` for a portal.
    - Formatting: **bold**, *italic*, <u>underline</u>, ~~strike~~, \`code\`, $e^{i\\pi}+1=0$ and <mark class="yellow">highlights</mark>.
    - [ ] Todos are Rems with a checkbox (type \`[] \` at the start)
- # Flashcards
    - A basic card has a front and a back >> type \\>\\> (or \\=\\=) between them
    - Reverse card << shown back first (\\<\\<)
    - Two-way card <> practiced in both directions (\\<\\>)
    - Spaced repetition :: a learning technique that reviews information at increasing intervals
        - inventor of the forgetting curve ;; Hermann Ebbinghaus
    - The {{mitochondria}}{({organelle})} is the powerhouse of the {{cell}}.
    - Which of these are spaced-repetition algorithms? {CORRECT: A, B} >>A)
        - SM-2
        - FSRS
        - Quicksort
        - Dijkstra
    - Three primary colours (multi-line card) >>>
        - Red
        - Yellow
        - Blue
    - Steps of the scientific method (list-answer card) >>1.
        - Observe
        - Hypothesise
        - Experiment
        - Conclude
    - Why do we forget? >> Memories decay without retrieval practice
        - Each successful recall makes the memory more stable. #[[Extra Card Detail]]
- # Practicing
    - Open **Flashcards** in the sidebar and press *Practice*. Rate each card from *Forgot* to *Easily recalled*.
    - Set a priority (Currently studying, Maintaining, Paused) on documents and folders on the Flashcards home page.
    - Create an exam in Flashcards → Exams: RemCraft spreads new cards until the exam and adds a final review.
`;

/** Remaps ids of imported Rems to deterministic seed ids. */
function deterministic(rems: Rem[], prefix: string): Rem[] {
  const map = new Map<RemId, RemId>();
  rems.forEach((r, i) => map.set(r.id, `${prefix}-${String(i).padStart(3, '0')}`));
  return rems.map((r) => ({
    ...r,
    id: map.get(r.id)!,
    parentId: r.parentId ? (map.get(r.parentId) ?? r.parentId) : null,
  }));
}

/**
 * Writes seed data into an empty store.
 *
 * @param store Target store.
 * @param now Timestamp for the records (old timestamps lose against real edits when syncing).
 */
export function seedStore(store: Store, now = 1): void {
  store.transact(
    (tx) => {
      tx.put('settings', createDefaultSettings(now));
      tx.put('schedulers', createDefaultScheduler(now));
      const welcome = createRem(
        {
          id: WELCOME_DOC_ID,
          parentId: null,
          order: 'a0',
          text: rt('Getting Started'),
          isDocument: true,
          pinned: true,
        },
        now,
      );
      tx.put('rems', welcome);
      const unresolved = (name: string): RemId => name;
      const rems = importMarkdown(WELCOME_MARKDOWN, WELCOME_DOC_ID, {
        resolveRef: unresolved,
        resolveTag: unresolved,
        now,
      });
      for (const r of deterministic(rems, WELCOME_DOC_ID)) tx.put('rems', r);
    },
    { keepTimestamps: true, undoable: false },
  );
}
