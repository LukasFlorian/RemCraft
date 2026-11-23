/**
 * Release notes shown once after an update ("Was ist neu").
 *
 * One entry per DEPLOYMENT (merge into `main`), not per commit: while a
 * branch is being worked on, new items go into the top entry as long as that
 * entry is not on `main` yet (`git show origin/main:src/ui/whatsnew/releases.ts`);
 * only after it was deployed does a new entry start. `id` must be unique and
 * increase (date plus a letter). Each user sees unseen entries once.
 */
import { t } from '@core/i18n';

/** One deployed version. */
export interface Release {
  /** Unique, increasing id, e.g. `2026-11-17b`. */
  id: string;
  /** Short headline. */
  title: string;
  /** What changed, from the user's point of view (one line each). */
  items: string[];
}

/** All releases, newest first. */
export const RELEASES: Release[] = [
  {
    id: '2026-11-19b',
    title: t('English or German, edit cards in the lecture'),
    items: [
      t(
        'RemCraft speaks English and German: choose the language in Settings → Appearance (applies to all your devices).',
      ),
      t(
        'The link to the beta version now really opens the beta, also in the installed app on phones (previously the normal version sometimes appeared again).',
      ),
      t('Lecture: cards in the cards widget can be edited right there (pencil icon).'),
    ],
  },
  {
    id: '2026-11-19a',
    title: t('Beta version, highlighted search results'),
    items: [
      t(
        'You can now try new features early in the beta version (Settings → Beta version). Your data stays the same.',
      ),
      t(
        'Search (⌘K): matches are highlighted in the results; for long texts you see the matching excerpt.',
      ),
      t('Flashcards overview: documents with long names now line up with the others.'),
    ],
  },
  {
    id: '2026-11-18b',
    title: t('Slides in read-only links, legal notice & privacy'),
    items: [
      t(
        'Read-only links that were missing slides (“Slide not available”) are repaired automatically as soon as you open RemCraft signed in – also very large PDFs.',
      ),
      t(
        'The share dialog shows when files are missing in a link, uploads them at the push of a button and names files that could not be uploaded.',
      ),
      t('The legal notice and privacy policy are at the bottom of the sidebar.'),
      t('You can now delete your account with all data yourself (Settings → Account & Sync).'),
    ],
  },
  {
    id: '2026-11-18a',
    title: t('AI editing, find & replace, live links'),
    items: [
      t(
        'Revise with AI (document menu): say in words what should change – you review every suggestion before it is applied.',
      ),
      t(
        'Find & replace (⌘⇧H or in the document menu): with preview, individual matches can be deselected, one undo for everything.',
      ),
      t(
        'Read-only links can update automatically (“Live” in the share dialog) – your changes appear after about 20 seconds.',
      ),
      t(
        'While practising, “View slide” and back with “Continue practice” – the session continues where you left off.',
      ),
      t('Cards in the lecture widget count like practice – now also with measured time.'),
      t(
        'Small things: icons in the sidebar line up, Cmd+Z with selected lines undoes only one step.',
      ),
    ],
  },
  {
    id: '2026-11-17c',
    title: t('Practice, sharing and a new icon'),
    items: [
      t(
        'New app icon – also on the iPhone home screen (add the app to the home screen again once).',
      ),
      t("List cards: after revealing, tap what you didn't know – the rating is suggested."),
      t('One button for everything: “Show answer” also checks multiple-choice and typed answers.'),
      t('The practice counter counts cards instead of answers and no longer grows.'),
      t('“Show answer” always shows the answer of the card on screen.'),
      t('Lectures are mixed in the daily queue; clozes of one sentence come on different days.'),
      t('Disable cards while practising (eye icon or D).'),
      t('Stats: list of your most difficult cards; Todoist estimates the duration per card.'),
      t('Shared slides load reliably, also on other devices.'),
      t('Search jumps straight to the match in the document.'),
      t('Move lines and images with “Up”/“Down” in the editing toolbar.'),
      t(
        'Editing a card while practising: only this card in the editor, and the keyboard stays open while typing.',
      ),
      t('Lecture view on phones: current slide large at the top, notes and cards below.'),
    ],
  },
];

/**
 * Releases the user has not seen yet.
 *
 * @param seen Id of the last release the user saw (`null`: never opened before).
 * @returns Newer releases, newest first. First-time users get none (nothing is new to them).
 */
export function unseenReleases(
  seen: string | null,
  releases: readonly Release[] = RELEASES,
): Release[] {
  if (seen === null) return [];
  return releases.filter((r) => r.id > seen);
}
