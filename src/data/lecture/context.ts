/**
 * Markdown context about slides, notes, cards and lectures - for the
 * assistant (context chips) and the "Export für KI" file (Fokus
 * `export.py` / `assistant.py`).
 */
import { slideStats } from '@core/lecture/analytics';
import { openQuestions } from '@core/lecture/notes';
import { buildLectureState, summarize } from '@core/lecture/session';
import { exportMarkdown } from '@core/io/markdown';
import { walkSubtree } from '@core/model/graph';
import type { Rem, RemId } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import type { Store } from '../store/store';

/** A piece of context the user selected. */
export type ContextChip =
  | { kind: 'slide' }
  | { kind: 'range'; from: number; to: number }
  | { kind: 'deck' }
  | { kind: 'notes' }
  | { kind: 'cards' }
  | { kind: 'lecture' }
  | { kind: 'course' };

/** Where the user currently is. */
export interface ContextPosition {
  deckId: RemId;
  slideIndex: number;
  lectureId: string | null;
}

/** Slides of a deck in order. */
function slidesOf(store: Store, deckId: RemId): Rem[] {
  return store
    .children(deckId)
    .filter((r) => r.slide)
    .sort((a, b) => a.slide!.index - b.slide!.index);
}

/** Plain text of all notes below a slide. */
export function slideNotesText(store: Store, slideId: RemId): string {
  const lines: string[] = [];
  walkSubtree(store, slideId, (r) => {
    if (r.id !== slideId)
      lines.push(toPlainText(r.text) + (r.back ? ` >> ${toPlainText(r.back)}` : ''));
  });
  const ann = store.getRecord('annotations', slideId);
  for (const b of ann?.boxes ?? []) lines.push(b.text);
  return lines.join('\n');
}

/** Markdown of one slide: text, markers, highlights and notes. */
export function slideMarkdown(store: Store, slide: Rem, withNotes = true): string {
  const i = (slide.slide?.index ?? 0) + 1;
  const parts = [
    `## Folie ${i} (PDF-Seite ${(slide.slide?.page ?? 0) + 1})`,
    slide.slideText ? `Folientext:\n${slide.slideText}` : '',
  ];
  if (slide.slideFlags?.length)
    parts.push(
      `Markierungen: ${slide.slideFlags.map((f) => (f === 'important' ? '★ wichtig' : '? unklar')).join(', ')}`,
    );
  const ann = store.getRecord('annotations', slide.id);
  if (ann?.marks.length)
    parts.push(
      `Von mir auf der Folie markiert:\n${ann.marks.map((m) => `- „${m.text}“`).join('\n')}`,
    );
  if (ann?.boxes.length)
    parts.push(`Textfelder auf der Folie:\n${ann.boxes.map((b) => `- ${b.text}`).join('\n')}`);
  if (withNotes && store.children(slide.id).length)
    parts.push(`Meine Notizen:\n${exportMarkdown(store, [slide.id], { includeRoot: false })}`);
  const open = openQuestions(slideNotesText(store, slide.id));
  if (open.length) parts.push(`Offene Fragen:\n${open.map((q) => `- ${q}`).join('\n')}`);
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Builds the context text for a set of chips.
 *
 * @param store Store.
 * @param pos Current deck/slide/lecture.
 * @param chips Selected context.
 */
export function buildContext(
  store: Store,
  pos: ContextPosition,
  chips: readonly ContextChip[],
): string {
  const deck = store.get(pos.deckId);
  const slides = slidesOf(store, pos.deckId);
  const out: string[] = [];
  if (deck)
    out.push(
      `# Foliensatz: ${toPlainText(deck.text)} (${deck.deck?.pdfName ?? ''}, ${slides.length} Folien)`,
    );
  for (const chip of chips) {
    switch (chip.kind) {
      case 'slide': {
        const s = slides[pos.slideIndex];
        if (s) out.push(slideMarkdown(store, s));
        break;
      }
      case 'range':
        for (const s of slides.slice(Math.max(0, chip.from - 1), chip.to))
          out.push(slideMarkdown(store, s));
        break;
      case 'deck':
        out.push(
          slides
            .map(
              (s) =>
                `Folie ${(s.slide?.index ?? 0) + 1} (S. ${(s.slide?.page ?? 0) + 1}): ${(s.slideText ?? '').replace(/\n/g, ' / ')}`,
            )
            .join('\n'),
        );
        break;
      case 'notes':
        for (const s of slides) {
          if (
            store.children(s.id).length ||
            s.slideFlags?.length ||
            store.getRecord('annotations', s.id)?.marks.length
          )
            out.push(slideMarkdown(store, s));
        }
        break;
      case 'cards': {
        const md = slides
          .map((s) => exportMarkdown(store, [s.id], { includeRoot: false }))
          .join('');
        out.push(`## Vorhandene Karten und Notizen (RemNote-Syntax)\n${md || '(keine)'}`);
        break;
      }
      case 'lecture': {
        if (!pos.lectureId) break;
        out.push(lectureMarkdown(store, pos.lectureId));
        break;
      }
      case 'course': {
        const courseId = deck?.parentId;
        if (!courseId) break;
        const docs: string[] = [];
        walkSubtree(
          store,
          courseId,
          (r) =>
            void (
              (r.isDocument || r.isFolder) &&
              r.id !== courseId &&
              docs.push(`- ${toPlainText(r.text)}${r.deck ? ' (Foliensatz)' : ''}`)
            ),
        );
        out.push(`## Kurs: ${toPlainText(store.get(courseId)?.text ?? [])}\n${docs.join('\n')}`);
        break;
      }
    }
  }
  return out.join('\n\n');
}

/** Markdown of a lecture: goal, summary, check-ins, time per slide. */
export function lectureMarkdown(store: Store, lectureId: string): string {
  const lecture = store.getRecord('lectures', lectureId);
  if (!lecture) return '';
  const st = buildLectureState(store.all('lectureEvents').filter((e) => e.lectureId === lectureId));
  const now = Date.now();
  const s = summarize(st, now);
  const slides = lecture.deckId ? slidesOf(store, lecture.deckId) : [];
  const stats = slideStats(st, slides.length, now);
  const lines = [
    `## Vorlesung: ${lecture.name}`,
    `Dauer: ${Math.round(s.durationMs / 60000)} min, außerhalb der App: ${Math.round(s.awayMs / 1000)} s, Abschweifen bemerkt: ${s.drifts}×`,
    st.goal ? `Ziel: ${st.goal}` : '',
    st.summary ? `Meine Zusammenfassung:\n${st.summary}` : '',
    st.checkins.filter((c) => c.text).length
      ? `Check-ins:\n${st.checkins
          .filter((c) => c.text)
          .map((c) => `- ${c.prompt} → ${c.text}${c.focus ? ` (Fokus ${c.focus}/5)` : ''}`)
          .join('\n')}`
      : '',
    stats.length
      ? `Zeit pro Folie:\n${stats
          .filter((x) => x.dwellMs > 0)
          .map(
            (x) =>
              `- Folie ${x.slide + 1}: ${Math.round(x.dwellMs / 1000)} s${x.awayMs ? `, davon ${Math.round(x.awayMs / 1000)} s außerhalb` : ''}`,
          )
          .join('\n')}`
      : '',
  ];
  return lines.filter(Boolean).join('\n\n');
}

/** The complete "Export für KI" of a deck (optionally with one lecture). */
export function exportForAi(store: Store, deckId: RemId, lectureId: string | null): string {
  const intro = `Anleitung für die KI: Erkläre Unklares (★/? markierte Folien), beantworte offene Fragen, prüfe meine Check-in-Antworten, erstelle Karteikarten (RemNote-Syntax) und Übungsfragen.`;
  return [
    intro,
    buildContext(store, { deckId, slideIndex: 0, lectureId }, [
      { kind: 'notes' },
      ...(lectureId ? [{ kind: 'lecture' } as const] : []),
      { kind: 'deck' },
    ]),
  ].join('\n\n');
}
