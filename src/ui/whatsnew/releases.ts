/**
 * Release notes shown once after an update ("Was ist neu").
 *
 * One entry per DEPLOYMENT (merge into `main`), not per commit: while a
 * branch is being worked on, new items go into the top entry as long as that
 * entry is not on `main` yet (`git show origin/main:src/ui/whatsnew/releases.ts`);
 * only after it was deployed does a new entry start. `id` must be unique and
 * increase (date plus a letter). Each user sees unseen entries once.
 */

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
    id: '2026-11-18a',
    title: 'KI-Bearbeitung, Suchen & Ersetzen, Live-Links',
    items: [
      'Mit KI überarbeiten (Dokument-Menü): sag in Worten, was geändert werden soll – du prüfst jeden Vorschlag, bevor er übernommen wird.',
      'Suchen & Ersetzen (⌘⇧H oder im Dokument-Menü): mit Vorschau, einzelne Treffer abwählbar, ein Rückgängig für alles.',
      'Leselinks können sich automatisch aktualisieren („Live“ im Teilen-Dialog) – deine Änderungen erscheinen nach etwa 20 Sekunden.',
      'Beim Üben „Folie ansehen“ und mit „Weiter üben“ zurück – die Sitzung läuft dort weiter, wo du warst.',
      'Karten im Vorlesungs-Widget zählen wie beim Üben – jetzt auch mit gemessener Zeit.',
      'Kleinigkeiten: Icons in der Seitenleiste stehen bündig, Cmd+Z bei markierten Zeilen macht nur noch einen Schritt rückgängig.',
    ],
  },
  {
    id: '2026-11-17c',
    title: 'Üben, Teilen und ein neues Icon',
    items: [
      'Neues App-Icon – auch auf dem iPhone-Homescreen (App einmal neu zum Homescreen hinzufügen).',
      'Listen-Karten: nach dem Aufdecken antippen, was du nicht wusstest – die Bewertung wird vorgeschlagen.',
      'Ein Button für alles: „Show answer“ prüft auch Multiple-Choice- und getippte Antworten.',
      'Der Zähler beim Üben zählt Karten statt Antworten und wächst nicht mehr.',
      '„Show answer“ zeigt immer die Lösung der angezeigten Karte.',
      'Vorlesungen werden in der täglichen Warteschlange gemischt; Clozes eines Satzes kommen an verschiedenen Tagen.',
      'Karten beim Üben deaktivieren (Augen-Symbol oder D).',
      'Stats: Liste deiner schwierigsten Karten; Todoist schätzt die Dauer pro Karte.',
      'Geteilte Folien laden zuverlässig, auch auf anderen Geräten.',
      'Suche springt direkt zur Fundstelle im Dokument.',
      'Zeilen und Bilder mit „Up“/„Down“ in der Bearbeiten-Leiste verschieben.',
      'Karte beim Üben bearbeiten: nur noch diese Karte im Editor, und die Tastatur bleibt beim Tippen offen.',
      'Vorlesungsansicht auf dem Handy: aktuelle Folie groß oben, darunter Notizen und Karten.',
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
